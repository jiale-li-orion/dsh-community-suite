package com.dsh.shell;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Comparator;

/**
 * On-disk cache for the content-addressed responses the client loads at start.
 *
 * Two facts make this safe and worth having. The client asks for each bundle by
 * revision and each shell asset by content hash, so a URL here names exactly one
 * byte sequence — caching it cannot pin stale content. And the start-up cost is
 * otherwise paid on every launch, because a WebView's own cache is a policy we
 * do not control; an app-private directory is not.
 *
 * Bodies are stored decoded. The host may compress a response, and replaying
 * compressed bytes to a client that did not ask for them would be wrong, so the
 * entry records the identity form and the headers that stay true for it.
 */
final class GatewayCache implements Closeable {

    private static final String TAG = "DshShell";
    /** Cache ceiling: the whole start-up payload is about 12 MiB, so this leaves room for a few generations. */
    private static final long MAX_BYTES = 96L * 1024 * 1024;
    private static final String[] CACHEABLE_PREFIXES = {"/plugins/", "/assets/"};
    private static final String[] CACHEABLE_TYPES = {"javascript", "css", "json", "svg", "font", "image/png", "image/jpeg", "webmanifest", "plain"};

    private final File root;

    GatewayCache(File root) {
        this.root = root;
        if (!root.exists() && !root.mkdirs()) Log.w(TAG, "cache directory not created: " + root);
    }

    /** @return true when the URL names immutable content and the method reads it. */
    static boolean isCacheable(String method, String path) {
        if (!"GET".equals(method)) return false;
        for (String prefix : CACHEABLE_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }

    /** One stored response: the body plus the headers that survive a replay. */
    static final class Entry {
        final byte[] body;
        final String contentType;

        Entry(byte[] body, String contentType) {
            this.body = body;
            this.contentType = contentType;
        }
    }

    /** @return the stored entry for one URL, or null when it is absent. */
    synchronized Entry lookup(String url) {
        File body = bodyFile(url);
        if (!body.isFile()) return null;
        try {
            byte[] bytes = readAll(body, body.length());
            String type = readType(url);
            // Touching the entry keeps the eviction order honest about use.
            body.setLastModified(System.currentTimeMillis());
            return new Entry(bytes, type);
        } catch (IOException error) {
            Log.w(TAG, "cache read failed for " + url + ": " + error.getMessage());
            body.delete();
            return null;
        }
    }

    /** @return true when the entry was stored. */
    synchronized boolean store(String url, byte[] body, String contentType) {
        File target = bodyFile(url);
        File temp = new File(target.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(body);
        } catch (IOException error) {
            Log.w(TAG, "cache write failed for " + url + ": " + error.getMessage());
            temp.delete();
            return false;
        }
        if (!temp.renameTo(target)) {
            temp.delete();
            return false;
        }
        try (FileOutputStream out = new FileOutputStream(typeFile(url))) {
            out.write((contentType == null ? "" : contentType).getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            Log.w(TAG, "cache type write failed for " + url + ": " + error.getMessage());
        }
        evict();
        return true;
    }

    /** @return true when this content type is worth storing. */
    static boolean isCacheableType(String contentType) {
        if (contentType == null) return false;
        String lower = contentType.toLowerCase(java.util.Locale.ROOT);
        for (String needle : CACHEABLE_TYPES) {
            if (lower.contains(needle)) return true;
        }
        return false;
    }

    @Override
    public void close() {
        // Nothing to release: every entry is flushed on write.
    }

    /** Drop the least recently used entries until the cache fits its ceiling. */
    private void evict() {
        File[] files = root.listFiles();
        if (files == null) return;
        long total = 0;
        for (File file : files) total += file.length();
        if (total <= MAX_BYTES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File file : files) {
            long length = file.length();
            if (!file.delete()) continue;
            total -= length;
            if (total <= MAX_BYTES) return;
        }
    }

    private File bodyFile(String url) {
        return new File(root, key(url));
    }

    private File typeFile(String url) {
        return new File(root, key(url) + ".type");
    }

    private String readType(String url) {
        File file = typeFile(url);
        if (!file.isFile()) return null;
        try {
            String value = new String(readAll(file, file.length()), StandardCharsets.UTF_8);
            return value.isEmpty() ? null : value;
        } catch (IOException error) {
            return null;
        }
    }

    private static byte[] readAll(File file, long length) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(0, Math.min(length, Integer.MAX_VALUE)));
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /** @return a filesystem-safe stable key for one URL. */
    private static String key(String url) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte value : hash) hex.append(String.format("%02x", value));
            return hex.toString();
        } catch (NoSuchAlgorithmException error) {
            /* v8 ignore next -- SHA-256 is required of every Android runtime */
            return Integer.toHexString(url.hashCode());
        }
    }
}
