package com.naamdevsweets.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.HandlerThread;
import android.os.IBinder;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Partner build only: a foreground service that keeps sending the rider's GPS position to
 * POST /api/v1/delivery/location while they are online — also while they navigate in another app.
 * It authenticates like the web page: a Firebase ID token as a bearer token. The partner site hands
 * over the signed-in rider's Firebase refresh token (setAuth), and the service exchanges it for
 * short-lived ID tokens with Firebase's secure-token endpoint, so tracking keeps working for hours
 * in the background. Nothing is written to disk.
 */
public class TrackingService extends Service implements LocationListener {
    static final String EXTRA_ORIGIN = "origin";
    static final String STATE_OFF = "off";
    static final String STATE_WAITING = "waiting";
    static final String STATE_OK = "ok";
    static final String STATE_DENIED = "denied";
    static final String STATE_SIGNED_OUT = "signed_out";
    static final String STATE_ERROR = "error";

    private static final String CHANNEL = "tracking";
    private static final int NOTIFICATION_ID = 7;
    private static final long MIN_INTERVAL_MS = 10_000L; // same throttle as the web app: ≥10 s …
    private static final float MIN_DISTANCE_M = 30f;      // … or ≥30 m moved
    private static volatile String state = STATE_OFF;
    static final String TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

    // Firebase credentials handed over by the partner site (memory only).
    private static volatile String apiKey;
    private static volatile String refreshToken;
    private static volatile String tokenUrl = TOKEN_URL;
    private static volatile String apiUrl; // where /api/v1/delivery/location lives (null = the site origin)
    private static String idToken;
    private static long idTokenExpiresAt;

    private LocationManager locationManager;
    private HandlerThread thread;
    private String origin;
    private Location lastSent;
    private long lastSentAt;

    static String state() {
        return state;
    }

    static void setState(String s) {
        state = s;
    }

    /** Called from the partner site (JSON: apiKey, refreshToken, optional tokenUrl for the local emulator). */
    static synchronized boolean setAuth(String json) {
        try {
            JSONObject o = new JSONObject(json);
            String key = o.optString("apiKey", "");
            String refresh = o.optString("refreshToken", "");
            String url = o.optString("tokenUrl", TOKEN_URL);
            boolean urlOk = TOKEN_URL.equals(url) || (BuildConfig.DEBUG && url.startsWith("http://") && url.endsWith("/securetoken.googleapis.com/v1/token"));
            String api = ShellConfig.originOf(o.optString("apiUrl", ""));
            boolean apiOk = api.isEmpty() || api.startsWith("https://") || BuildConfig.DEBUG;
            if (key.isEmpty() || refresh.isEmpty() || !urlOk || !apiOk) return false;
            if (!refresh.equals(refreshToken)) {
                idToken = null;
                idTokenExpiresAt = 0;
            }
            apiKey = key;
            refreshToken = refresh;
            tokenUrl = url;
            apiUrl = api.isEmpty() ? null : api;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static synchronized void clearAuth() {
        apiKey = null;
        refreshToken = null;
        idToken = null;
        idTokenExpiresAt = 0;
    }

    static boolean hasAuth() {
        return refreshToken != null && apiKey != null;
    }

    /** A valid Firebase ID token, refreshed when it is about to expire; null when signed out. */
    private static synchronized String idToken(boolean forceRefresh) throws Exception {
        if (!hasAuth()) return null;
        if (!forceRefresh && idToken != null && System.currentTimeMillis() < idTokenExpiresAt - 120_000L) return idToken;
        HttpURLConnection c = null;
        try {
            byte[] form = ("grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8")).getBytes(StandardCharsets.UTF_8);
            c = (HttpURLConnection) new URL(tokenUrl + "?key=" + URLEncoder.encode(apiKey, "UTF-8")).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10_000);
            c.setReadTimeout(10_000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(form.length);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream os = c.getOutputStream()) {
                os.write(form);
            }
            int code = c.getResponseCode();
            if (code >= 400) {
                drain(c.getErrorStream());
                if (code == 400 || code == 401 || code == 403) clearAuth(); // revoked / password changed / disabled
                return null;
            }
            JSONObject r = new JSONObject(readAll(c.getInputStream()));
            idToken = r.getString("id_token");
            idTokenExpiresAt = System.currentTimeMillis() + r.optLong("expires_in", 3600L) * 1000L;
            String rotated = r.optString("refresh_token", "");
            if (!rotated.isEmpty()) refreshToken = rotated;
            return idToken;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String o = intent == null ? null : intent.getStringExtra(EXTRA_ORIGIN);
        if (o == null || o.isEmpty()) o = ShellConfig.serverUrl(this);
        if (o == null || o.isEmpty() || !startInForeground()) {
            state = STATE_ERROR;
            stopSelf();
            return START_NOT_STICKY;
        }
        origin = o;
        if (thread == null) {
            thread = new HandlerThread("naamdev-gps");
            thread.start();
        }
        requestUpdates();
        // Not sticky: if Android kills the app, the partner site restarts sharing when it is reopened.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        if (thread != null) thread.quitSafely();
        thread = null;
        if (STATE_OK.equals(state) || STATE_WAITING.equals(state)) state = STATE_OFF;
        super.onDestroy();
    }

    private boolean startInForeground() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.tracking_channel), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(getString(R.string.tracking_channel_description));
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : legacyBuilder();
        b.setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(getString(R.string.tracking_title))
                .setContentText(getString(R.string.tracking_text))
                .setContentIntent(pi)
                .setOngoing(true)
                .setColor(getColor(R.color.brand));
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, b.build());
            }
            return true;
        } catch (RuntimeException e) { // missing permission or not allowed from the background
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyBuilder() {
        return new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
    }

    private void requestUpdates() {
        if (locationManager == null) locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) {
            state = STATE_ERROR;
            stopSelf();
            return;
        }
        locationManager.removeUpdates(this);
        boolean any = false;
        for (String provider : new String[] {LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            if (!locationManager.getAllProviders().contains(provider)) continue;
            try {
                locationManager.requestLocationUpdates(provider, 5_000L, 0f, this, thread.getLooper());
                any = true;
            } catch (SecurityException e) {
                state = STATE_DENIED;
                stopSelf();
                return;
            } catch (IllegalArgumentException ignored) {
                // provider unavailable on this device
            }
        }
        if (!any) {
            state = STATE_ERROR;
            stopSelf();
            return;
        }
        state = STATE_WAITING;
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null) return;
        long now = System.currentTimeMillis();
        if (lastSent != null) {
            float moved = lastSent.distanceTo(loc);
            if (now - lastSentAt < MIN_INTERVAL_MS && moved < MIN_DISTANCE_M) return;
            // A coarse network fix shouldn't replace a recent, precise GPS fix.
            if (loc.hasAccuracy() && lastSent.hasAccuracy() && loc.getAccuracy() > 4 * Math.max(lastSent.getAccuracy(), 25f) && now - lastSentAt < 60_000L) return;
        }
        lastSent = new Location(loc);
        lastSentAt = now;
        send(loc); // runs on the "naamdev-gps" thread, never the UI thread
    }

    private void send(Location loc) {
        try {
            String token = idToken(false);
            if (token == null) {
                state = STATE_SIGNED_OUT;
                stopSelf();
                return;
            }
            JSONObject body = new JSONObject();
            body.put("lat", loc.getLatitude());
            body.put("lng", loc.getLongitude());
            if (loc.hasBearing()) body.put("heading", clamp(loc.getBearing(), 0, 360));
            if (loc.hasSpeed()) body.put("speed", clamp(loc.getSpeed(), 0, 100));
            if (loc.hasAccuracy()) body.put("accuracy", clamp(loc.getAccuracy(), 0, 10_000));
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

            int code = post(bytes, token);
            if (code == 401) {
                // The ID token may have been revoked early: refresh once before giving up.
                token = idToken(true);
                code = token == null ? 401 : post(bytes, token);
            }
            if (code == 401 || code == 403) {
                state = STATE_SIGNED_OUT; // signed out, partner went offline or account suspended
                stopSelf();
            } else {
                state = code < 400 ? STATE_OK : STATE_ERROR;
            }
        } catch (Exception e) {
            state = STATE_WAITING; // no network right now; the next fix retries
        }
    }

    private int post(byte[] bytes, String token) throws Exception {
        HttpURLConnection c = null;
        try {
            String base = apiUrl != null ? apiUrl : origin;
            c = (HttpURLConnection) new URL(base + "/api/v1/delivery/location").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10_000);
            c.setReadTimeout(10_000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(bytes.length);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("x-nds-app", "delivery");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("User-Agent", "NaamdevPartner/" + BuildConfig.VERSION_NAME + " (Android " + Build.VERSION.RELEASE + ")");
            try (OutputStream os = c.getOutputStream()) {
                os.write(bytes);
            }
            int code = c.getResponseCode();
            drain(code >= 400 ? c.getErrorStream() : c.getInputStream());
            return code;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    private static String readAll(InputStream in) throws Exception {
        try (InputStream is = in) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[2048];
            int n;
            while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static void drain(InputStream in) {
        if (in == null) return;
        try (InputStream is = in) {
            byte[] buf = new byte[1024];
            while (is.read(buf) != -1) {
                // discard
            }
        } catch (Exception ignored) {
            // response body not needed
        }
    }

    // Older Android versions declare these as abstract; keep explicit no-op implementations.
    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    @SuppressWarnings("deprecation")
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}
}
