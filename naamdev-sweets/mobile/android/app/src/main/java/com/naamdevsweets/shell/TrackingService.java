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
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Partner build only: a foreground service that keeps sending the rider's GPS position to
 * POST /api/v1/delivery/location while they are online — also while they navigate in another app.
 * It reuses the partner site's session cookie and CSRF token, exactly like the web page does.
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
        CookieManager.getInstance(); // initialise on the main thread before the worker uses it
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
        HttpURLConnection c = null;
        try {
            String cookies = CookieManager.getInstance().getCookie(origin);
            String csrf = cookieValue(cookies, "nds_csrf");
            if (cookies == null || csrf == null) {
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

            c = (HttpURLConnection) new URL(origin + "/api/v1/delivery/location").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10_000);
            c.setReadTimeout(10_000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(bytes.length);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("x-nds-app", "delivery");
            c.setRequestProperty("x-csrf-token", csrf);
            c.setRequestProperty("Cookie", cookies);
            c.setRequestProperty("User-Agent", "NaamdevPartner/" + BuildConfig.VERSION_NAME + " (Android " + Build.VERSION.RELEASE + ")");
            try (OutputStream os = c.getOutputStream()) {
                os.write(bytes);
            }
            int code = c.getResponseCode();
            drain(code >= 400 ? c.getErrorStream() : c.getInputStream());
            if (code == 401 || code == 403) {
                state = STATE_SIGNED_OUT; // session ended or partner went offline/suspended
                stopSelf();
            } else {
                state = code < 400 ? STATE_OK : STATE_ERROR;
            }
        } catch (Exception e) {
            state = STATE_WAITING; // no network right now; the next fix retries
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    static String cookieValue(String cookies, String name) {
        if (cookies == null) return null;
        for (String part : cookies.split(";")) {
            String p = part.trim();
            int eq = p.indexOf('=');
            if (eq > 0 && p.substring(0, eq).equals(name)) {
                String v = p.substring(eq + 1);
                return v.isEmpty() ? null : v;
            }
        }
        return null;
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
