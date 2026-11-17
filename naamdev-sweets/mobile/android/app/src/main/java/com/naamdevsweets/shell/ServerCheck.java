package com.naamdevsweets.shell;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import javax.net.ssl.SSLException;

/** Confirms that an address really serves the NAAMDEV site this app expects (runs off the UI thread). */
final class ServerCheck {
    private ServerCheck() {}

    /** @return null when the site is reachable and is the right app, otherwise a message for the user. */
    static String check(String origin, boolean partner) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(origin + "/manifest.webmanifest").openConnection();
            c.setConnectTimeout(10_000);
            c.setReadTimeout(10_000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("Accept", "application/manifest+json, application/json");
            int code = c.getResponseCode();
            if (code != 200) return "That address answered with an error (" + code + "). Check it and try again.";
            String body = read(c.getInputStream()).toLowerCase(Locale.ROOT);
            if (!body.contains("naamdev")) return "That address doesn't look like a NAAMDEV SWEETS site.";
            boolean isPartnerSite = body.contains("partner");
            if (partner && !isPartnerSite) return "That's the storefront. Enter the delivery partner site address instead.";
            if (!partner && isPartnerSite) return "That's the delivery partner site. Enter the storefront address instead.";
            return null;
        } catch (SSLException e) {
            return "Secure connection failed. Check the address and that the site's HTTPS certificate is valid.";
        } catch (Exception e) {
            return "Couldn't reach that address. Check your internet connection and the address.";
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            int total = 0;
            while ((n = is.read(buf)) != -1 && total < 64 * 1024) {
                out.write(buf, 0, n);
                total += n;
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
