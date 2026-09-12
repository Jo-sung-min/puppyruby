package com.puppyruby.walk;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

final class WalkPhoto {
    private WalkPhoto() {}
    static boolean valid(byte[] bytes, boolean webp) {
        if (webp) return validWebp(bytes);
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) return false;
            var reader = readers.next();
            try {
                reader.setInput(input);
                if (!dimensions(reader.getWidth(0), reader.getHeight(0))) return false;
                return reader.read(0) != null;
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException error) { return false; }
    }

    private static boolean dimensions(int width, int height) {
        return width > 0 && height > 0 && width <= 1024 && height <= 1024;
    }

    // Java ImageIO has no bundled WebP decoder; validate its container and declared raster dimensions.
    private static boolean validWebp(byte[] bytes) {
        if (bytes.length < 30 || unsigned(bytes, 4, 4) + 8 != bytes.length) return false;
        boolean image = false;
        int offset = 12;
        while (offset + 8 <= bytes.length) {
            String chunk = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            long length = unsigned(bytes, offset + 4, 4);
            int data = offset + 8;
            if (length > bytes.length - data) return false;
            if (chunk.equals("VP8X")) {
                if (length != 10 || !dimensions(1 + (int) unsigned(bytes, data + 4, 3), 1 + (int) unsigned(bytes, data + 7, 3))) return false;
            } else if (chunk.equals("VP8 ")) {
                if (length < 11 || (bytes[data + 3] & 255) != 157 || bytes[data + 4] != 1 || bytes[data + 5] != 42
                    || !dimensions((int) unsigned(bytes, data + 6, 2) & 0x3fff, (int) unsigned(bytes, data + 8, 2) & 0x3fff)) return false;
                image = true;
            } else if (chunk.equals("VP8L")) {
                if (length < 6 || bytes[data] != 47) return false;
                long bits = unsigned(bytes, data + 1, 4);
                if (!dimensions(1 + ((int) bits & 0x3fff), 1 + ((int) (bits >> 14) & 0x3fff))) return false;
                image = true;
            }
            offset = data + (int) length + ((int) length & 1);
        }
        return image && offset == bytes.length;
    }

    private static long unsigned(byte[] bytes, int offset, int count) {
        long value = 0;
        for (int index = 0; index < count; index++) value |= (long) (bytes[offset + index] & 255) << (8 * index);
        return value;
    }
}
