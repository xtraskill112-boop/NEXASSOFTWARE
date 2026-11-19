package com.naamdevsweets.shell;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Hosts the NAAMDEV SWEETS storefront (customer build), partner site (partner build) or staff console
 * (admin build) in a WebView and adds what a browser tab can't: camera uploads, location prompts,
 * UPI/phone/maps hand-off, printing invoices and slips, saving downloaded files (reports, documents),
 * an offline screen and — for riders — background location sharing.
 */
public class MainActivity extends Activity {
    static final String ASSET_BASE = "file:///android_asset/";
    private static final int REQ_FILE = 101;
    private static final int REQ_GEO = 102;
    private static final int REQ_TRACK = 103;
    private static final int REQ_SAVE = 104;
    /** Largest download the page may hand over for saving (base64 characters, about 15 MB of data). */
    private static final int MAX_SAVE_BASE64 = 20 * 1024 * 1024;
    private static final String[] LOCATION_PERMISSIONS = {
            Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION,
    };
    private static final String PRINT_SHIM =
            "(function(){if(window.NaamdevAndroid&&!window.__ndPrint){window.__ndPrint=true;"
                    + "window.print=function(){window.NaamdevAndroid.print();};}})();";

    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;
    private volatile String currentUrl = "";
    private String failedUrl;

    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private Dialog popupDialog;
    private WebView popupWeb;

    private byte[] pendingSave;
    private String pendingSaveMime;
    private boolean pendingSaveOpen;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.shell_bar));
        setContentView(root);
        setupEdgeToEdge();

        createWebView();
        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) return;
        openStart();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        closePopup();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (popupDialog != null) {
            closePopup();
            return;
        }
        if (web != null && !currentUrl.startsWith(ASSET_BASE) && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    // ── Window & WebView setup ─────────────────────────────────────────────────

    /** Android 11+: draw behind the system bars and pad the page by their size (and the keyboard). */
    @SuppressWarnings("deprecation")
    private void setupEdgeToEdge() {
        if (Build.VERSION.SDK_INT < 30) return; // older versions resize the window themselves
        getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.page_background));
        configure(web);
        web.setWebViewClient(new ShellClient());
        web.setWebChromeClient(new ShellChrome());
        web.addJavascriptInterface(new Bridge(), "NaamdevAndroid");
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true); // Razorpay Checkout runs in an iframe
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(false); // file:///android_asset/ stays readable
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " NaamdevApp/" + BuildConfig.VERSION_NAME + " (" + BuildConfig.APP_KIND + ")");
    }

    private void openStart() {
        String server = ShellConfig.serverUrl(this);
        if (server.isEmpty()) {
            web.loadUrl(ASSET_BASE + "setup.html");
        } else {
            web.loadUrl(server + "/");
        }
    }

    // ── Navigation rules ───────────────────────────────────────────────────────

    /** @return true when the URL was handled outside the WebView (or blocked). */
    private boolean route(Uri u, boolean mainFrame) {
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        switch (scheme) {
            case "http":
            case "https":
                if (!mainFrame) return false;
                if (ShellConfig.isSameOrigin(this, u.toString()) || ShellConfig.isPaymentHost(u.getHost())) return false;
                openExternal(u); // other websites open in the browser
                return true;
            case "about":
            case "blob":
                return false;
            case "intent":
                openIntentUrl(u.toString());
                return true;
            case "file":
            case "content":
            case "javascript":
            case "data":
                return true; // never navigate the app to these
            default:
                openExternal(u); // tel:, mailto:, sms:, upi:, whatsapp:, geo: …
                return true;
        }
    }

    private void openExternal(Uri u) {
        Intent i = new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            if ("upi".equalsIgnoreCase(u.getScheme())) {
                try { // some UPI apps don't declare BROWSABLE
                    startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                } catch (ActivityNotFoundException ignored) {
                    toast(getString(R.string.no_upi_app));
                    return;
                }
            }
            toast(getString(R.string.no_app));
        }
    }

    private void openIntentUrl(String url) {
        Intent i;
        try {
            i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            return;
        }
        i.addCategory(Intent.CATEGORY_BROWSABLE);
        i.setComponent(null);
        i.setSelector(null);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
            return;
        } catch (ActivityNotFoundException ignored) {
            // fall through to the fallback URL or the store listing
        }
        String fallback = i.getStringExtra("browser_fallback_url");
        if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
            openExternal(Uri.parse(fallback));
        } else if (i.getPackage() != null) {
            openExternal(Uri.parse("market://details?id=" + i.getPackage()));
        } else {
            toast(getString(R.string.no_app));
        }
    }

    private class ShellClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(request.getUrl(), request.isForMainFrame());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            currentUrl = url == null ? "" : url;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            currentUrl = url == null ? "" : url; // client-side (SPA) navigations
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            currentUrl = url == null ? "" : url;
            if (ShellConfig.isSameOrigin(MainActivity.this, currentUrl)) view.evaluateJavascript(PRINT_SHIM, null);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            String url = request.getUrl().toString();
            if (url.startsWith(ASSET_BASE)) return;
            failedUrl = url;
            view.loadUrl(ASSET_BASE + "offline.html");
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel(); // never proceed past certificate errors
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The page renderer crashed or was killed: rebuild the WebView instead of crashing the app.
            if (view == web) {
                root.removeView(web);
                web.destroy();
                createWebView();
                openStart();
            } else {
                closePopup();
            }
            return true;
        }
    }

    // ── Chrome client: uploads, location, popups ───────────────────────────────

    private class ShellChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            discardCameraUri();

            Intent picker;
            try {
                picker = params.createIntent();
            } catch (RuntimeException e) {
                picker = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
            }
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            Intent chooser = Intent.createChooser(picker, getString(R.string.choose_file));
            Intent camera = acceptsImages(params) ? cameraIntent() : null;
            if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {camera});
            try {
                startActivityForResult(chooser, REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                discardCameraUri();
                return false;
            }
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!ShellConfig.isSameOrigin(MainActivity.this, origin)) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
                return;
            }
            geoCallback = callback;
            geoOrigin = origin;
            requestPermissions(LOCATION_PERMISSIONS, REQ_GEO);
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny(); // no camera/microphone streaming from pages
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            WebView child = new WebView(MainActivity.this);
            configure(child);
            CookieManager.getInstance().setAcceptThirdPartyCookies(child, true);
            child.setWebViewClient(new PopupClient(child));
            child.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    closePopup();
                }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(child);
            resultMsg.sendToTarget();
            return true;
        }
    }

    /**
     * Decides what a new window (window.open / target=_blank) becomes: payment popups (Razorpay,
     * then the bank's 3-D Secure pages) stay in an in-app sheet; our own pages open in the main view;
     * anything else opens in the browser.
     */
    private class PopupClient extends WebViewClient {
        private final WebView child;
        private boolean decided;
        private boolean shown;

        PopupClient(WebView child) {
            this.child = child;
        }

        private boolean decide(Uri u) {
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) {
                if (scheme.equals("about") || scheme.equals("blob")) return false;
                route(u, true);
                if (!shown) discard();
                return true;
            }
            if (decided) return false;
            decided = true;
            if (ShellConfig.isPaymentHost(u.getHost())) {
                shown = true;
                showPopup(child);
                return false;
            }
            discard();
            if (ShellConfig.isSameOrigin(MainActivity.this, u.toString())) {
                web.loadUrl(u.toString());
            } else {
                openExternal(u);
            }
            return true;
        }

        private void discard() {
            main.post(() -> {
                child.stopLoading();
                child.destroy();
            });
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return decide(request.getUrl());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (!decided && url != null && !url.startsWith("about:")) decide(Uri.parse(url));
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
        }
    }

    private void showPopup(WebView child) {
        closePopup();
        popupWeb = child;
        Dialog d = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setFitsSystemWindows(true);
        box.setBackgroundColor(getColor(R.color.page_background_light));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(getColor(R.color.shell_bar));
        int pad = dp(14);
        bar.setPadding(pad, dp(10), pad, dp(10));
        TextView title = new TextView(this);
        title.setText(R.string.secure_payment);
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(16);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView close = new TextView(this);
        close.setText(R.string.close);
        close.setTextColor(0xFFFFFFFF);
        close.setTextSize(15);
        close.setPadding(dp(12), dp(6), dp(4), dp(6));
        close.setOnClickListener(v -> closePopup());
        bar.addView(close);

        box.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        box.addView(child, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        d.setContentView(box);
        d.setOnDismissListener(x -> {
            if (popupDialog == d) closePopup();
        });
        d.setOnKeyListener((dialog, keyCode, event) -> {
            if (keyCode == android.view.KeyEvent.KEYCODE_BACK && event.getAction() == android.view.KeyEvent.ACTION_UP) {
                if (child.canGoBack()) child.goBack(); else closePopup();
                return true;
            }
            return false;
        });
        popupDialog = d;
        d.show();
    }

    private void closePopup() {
        Dialog d = popupDialog;
        popupDialog = null;
        if (d != null && d.isShowing()) d.dismiss();
        WebView w = popupWeb;
        popupWeb = null;
        if (w != null) {
            ViewGroup parent = (ViewGroup) w.getParent();
            if (parent != null) parent.removeView(w);
            w.destroy();
        }
    }

    // ── Uploads ────────────────────────────────────────────────────────────────

    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        boolean any = false;
        for (String t : types) {
            if (t == null || t.trim().isEmpty()) continue;
            any = true;
            String x = t.trim().toLowerCase(Locale.ROOT);
            if (x.startsWith("image/") || x.equals("*/*") || x.equals(".jpg") || x.equals(".jpeg") || x.equals(".png")) return true;
        }
        return !any;
    }

    /** A camera intent that writes a full-size photo to Pictures/NAAMDEV (Android 10+, no storage permission). */
    private Intent cameraIntent() {
        if (Build.VERSION.SDK_INT < 29) return null;
        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cam.resolveActivity(getPackageManager()) == null) return null;
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, "naamdev_" + System.currentTimeMillis() + ".jpg");
        v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/NAAMDEV");
        try {
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        } catch (RuntimeException e) {
            cameraUri = null;
        }
        if (cameraUri == null) return null;
        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return cam;
    }

    private void discardCameraUri() {
        if (cameraUri != null) {
            try {
                getContentResolver().delete(cameraUri, null, null);
            } catch (RuntimeException ignored) {
                // nothing was written
            }
            cameraUri = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_SAVE) {
            finishSave(resultCode == RESULT_OK && data != null ? data.getData() : null);
            return;
        }
        if (requestCode != REQ_FILE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (fileCallback == null) return;
        Uri[] result = null;
        boolean usedCamera = false;
        if (resultCode == RESULT_OK) {
            ClipData clip = data == null ? null : data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                result = new Uri[] {data.getData()};
            } else if (cameraUri != null) {
                result = new Uri[] {cameraUri};
                usedCamera = true;
            }
        }
        if (usedCamera || (result != null && cameraUri != null && result.length == 1 && cameraUri.equals(result[0]))) {
            cameraUri = null; // keep the photo the user just took
        } else {
            discardCameraUri();
        }
        ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        cb.onReceiveValue(result);
    }

    // ── Saving downloads (reports, documents) ──────────────────────────────────

    /** Asks where to save (Android's file picker, no storage permission needed), then writes the file. */
    private void startSave(byte[] bytes, String name, String mime, boolean open) {
        pendingSave = bytes;
        pendingSaveMime = mime;
        pendingSaveOpen = open;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (ActivityNotFoundException e) {
            pendingSave = null;
            toast(getString(R.string.save_failed));
        }
    }

    private void finishSave(Uri target) {
        byte[] bytes = pendingSave;
        String mime = pendingSaveMime;
        boolean open = pendingSaveOpen;
        pendingSave = null;
        if (bytes == null || target == null) return; // cancelled
        try (OutputStream out = getContentResolver().openOutputStream(target)) {
            if (out == null) throw new IOException("no output stream");
            out.write(bytes);
        } catch (IOException | RuntimeException e) {
            toast(getString(R.string.save_failed));
            return;
        }
        toast(getString(R.string.saved));
        if (!open) return;
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(target, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(view);
        } catch (ActivityNotFoundException e) {
            toast(getString(R.string.no_app));
        }
    }

    /** Keeps a page-suggested file name to plain characters (no folders), with a fallback. */
    static String safeFileName(String name) {
        String s = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.length() > 100) s = s.substring(s.length() - 100);
        return s.isEmpty() || s.startsWith(".") ? "naamdev-download" + s : s;
    }

    // ── Permissions ────────────────────────────────────────────────────────────

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = hasLocationPermission();
        if (requestCode == REQ_GEO && geoCallback != null) {
            geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
            geoOrigin = null;
        } else if (requestCode == REQ_TRACK) {
            if (granted) startTrackingService(); else TrackingService.setState(TrackingService.STATE_DENIED);
        }
    }

    // ── Rider location sharing (partner build) ─────────────────────────────────

    private void requestTracking() {
        if (!ShellConfig.isPartner()) return;
        List<String> need = new ArrayList<>();
        if (!hasLocationPermission()) {
            for (String p : LOCATION_PERMISSIONS) need.add(p);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (need.isEmpty()) {
            startTrackingService();
            return;
        }
        TrackingService.setState(TrackingService.STATE_WAITING);
        requestPermissions(need.toArray(new String[0]), REQ_TRACK);
    }

    private void startTrackingService() {
        String server = ShellConfig.serverUrl(this);
        if (server.isEmpty()) return;
        TrackingService.setState(TrackingService.STATE_WAITING);
        Intent i = new Intent(this, TrackingService.class).putExtra(TrackingService.EXTRA_ORIGIN, server);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        } catch (RuntimeException e) {
            TrackingService.setState(TrackingService.STATE_ERROR);
        }
    }

    private void stopTrackingService() {
        stopService(new Intent(this, TrackingService.class));
        TrackingService.setState(TrackingService.STATE_OFF);
    }

    // ── Printing ───────────────────────────────────────────────────────────────

    private void printPage() {
        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
        if (pm == null || web == null) return;
        String title = web.getTitle() == null ? "" : web.getTitle();
        String job = getString(R.string.app_name) + (title.isEmpty() ? "" : " — " + title);
        pm.print(job, web.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
    }

    // ── JavaScript bridge (window.NaamdevAndroid) ──────────────────────────────

    /** Methods run on a WebView background thread; each checks which page is asking. */
    private final class Bridge {
        private boolean fromSite() {
            return ShellConfig.isSameOrigin(MainActivity.this, currentUrl);
        }

        private boolean fromAppPage() {
            return currentUrl.startsWith(ASSET_BASE);
        }

        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("app", BuildConfig.APP_KIND);
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("locked", ShellConfig.isLocked());
                if (fromAppPage()) o.put("server", ShellConfig.serverUrl(MainActivity.this));
            } catch (JSONException ignored) {
                // static keys
            }
            return o.toString();
        }

        @JavascriptInterface
        public void connect(String address) {
            if (!fromAppPage() || ShellConfig.isLocked()) return;
            final String server = ShellConfig.normalize(address);
            if (server.isEmpty()) {
                main.post(() -> reply(getString(R.string.invalid_address)));
                return;
            }
            new Thread(() -> {
                String error = ServerCheck.check(server, BuildConfig.APP_KIND);
                main.post(() -> {
                    if (error != null) {
                        reply(error);
                        return;
                    }
                    ShellConfig.saveServerUrl(MainActivity.this, server);
                    web.loadUrl(server + "/");
                });
            }, "naamdev-server-check").start();
        }

        @JavascriptInterface
        public void retry() {
            if (!fromAppPage()) return;
            main.post(() -> {
                String target = failedUrl;
                failedUrl = null;
                if (target != null && ShellConfig.isSameOrigin(MainActivity.this, target)) web.loadUrl(target); else openStart();
            });
        }

        @JavascriptInterface
        public void changeServer() {
            if (!fromAppPage() || ShellConfig.isLocked()) return;
            main.post(() -> {
                stopTrackingService();
                ShellConfig.clearServerUrl(MainActivity.this);
                web.clearHistory();
                web.loadUrl(ASSET_BASE + "setup.html");
            });
        }

        @JavascriptInterface
        public void print() {
            if (!fromSite()) return;
            main.post(MainActivity.this::printPage);
        }

        /** Saves a file the page downloaded (reports, documents); with open=true it is opened afterwards. */
        @JavascriptInterface
        public void saveFile(String base64, String filename, String mime, boolean open) {
            if (!fromSite() || base64 == null || base64.isEmpty() || base64.length() > MAX_SAVE_BASE64) return;
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            final String name = safeFileName(filename);
            final String type = mime != null && mime.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+") ? mime : "application/octet-stream";
            main.post(() -> startSave(bytes, name, type, open));
        }

        @JavascriptInterface
        public boolean canTrack() {
            return ShellConfig.isPartner();
        }

        @JavascriptInterface
        public void startTracking() {
            if (!fromSite() || !ShellConfig.isPartner()) return;
            main.post(MainActivity.this::requestTracking);
        }

        /** Hands the signed-in rider's Firebase credentials to the tracking service (memory only). */
        @JavascriptInterface
        public boolean setAuth(String json) {
            if (!fromSite() || !ShellConfig.isPartner() || json == null || json.length() > 8192) return false;
            return TrackingService.setAuth(json);
        }

        @JavascriptInterface
        public void stopTracking() {
            if (!fromSite()) return;
            main.post(MainActivity.this::stopTrackingService);
        }

        @JavascriptInterface
        public void signedOut() {
            if (!fromSite()) return;
            TrackingService.clearAuth();
            main.post(MainActivity.this::stopTrackingService);
        }

        @JavascriptInterface
        public String trackingState() {
            return TrackingService.state();
        }
    }

    private void reply(String message) {
        if (web == null) return;
        web.evaluateJavascript("window.onConnectResult&&window.onConnectResult(" + JSONObject.quote(message) + ")", null);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
