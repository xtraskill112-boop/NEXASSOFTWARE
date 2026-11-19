package com.naamdevsweets.shell;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import java.util.Locale;

/** Which site this app opens, and how URLs are compared against it. */
final class ShellConfig {
    private static final String PREFS = "naamdev_shell";
    private static final String KEY_SERVER = "server_url";

    private ShellConfig() {}

    static boolean isPartner() {
        return "partner".equals(BuildConfig.APP_KIND);
    }

    /** The staff console app (store owner, managers, packing staff). */
    static boolean isAdmin() {
        return "admin".equals(BuildConfig.APP_KIND);
    }

    /** True when the site address was fixed at build time (production builds). */
    static boolean isLocked() {
        return !BuildConfig.START_URL.isEmpty();
    }

    /** The site origin (scheme://host[:port]) or "" when it hasn't been set up yet. */
    static String serverUrl(Context c) {
        if (isLocked()) return normalize(BuildConfig.START_URL);
        return prefs(c).getString(KEY_SERVER, "");
    }

    static void saveServerUrl(Context c, String origin) {
        prefs(c).edit().putString(KEY_SERVER, origin).apply();
    }

    static void clearServerUrl(Context c) {
        prefs(c).edit().remove(KEY_SERVER).apply();
    }

    /** Turns user input such as "shop.example.com" into "https://shop.example.com"; "" if invalid. */
    static String normalize(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        if (s.isEmpty()) return "";
        if (!s.toLowerCase(Locale.ROOT).startsWith("http://") && !s.toLowerCase(Locale.ROOT).startsWith("https://")) {
            s = "https://" + s;
        }
        return originOf(s);
    }

    /** scheme://host[:port] for http(s) URLs, "" for anything else. Default ports are dropped. */
    static String originOf(String url) {
        if (url == null) return "";
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty() || (!scheme.equals("http") && !scheme.equals("https"))) return "";
        int port = u.getPort();
        boolean defaultPort = port == -1 || (scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443);
        return scheme + "://" + host + (defaultPort ? "" : ":" + port);
    }

    static boolean isSameOrigin(Context c, String url) {
        String server = serverUrl(c);
        return !server.isEmpty() && server.equals(originOf(url));
    }

    static boolean isPaymentHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("razorpay.com") || h.endsWith(".razorpay.com");
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
