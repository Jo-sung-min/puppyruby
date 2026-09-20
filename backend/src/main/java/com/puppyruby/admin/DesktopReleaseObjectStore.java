package com.puppyruby.admin;

import java.util.Map;

interface DesktopReleaseObjectStore {
    final class PreconditionFailed extends RuntimeException {
        PreconditionFailed() { super(null, null, false, false); }
    }
    record UploadObject(String key, String name, long size, String checksumBase64, String sha256Hex,
                        String contentType, String contentDisposition, String cacheControl) {}
    record SignedUpload(String url, Map<String, String> headers) {}
    record Head(long size, String checksumBase64, String contentType, String contentDisposition,
                String cacheControl, Map<String, String> metadata) {}
    record Pointer(byte[] bytes, String eTag) {}

    SignedUpload presign(UploadObject upload, int ttlSeconds);
    Head head(String key);
    byte[] readRange(String key, long first, long last);
    void createText(UploadObject upload, byte[] body);
    Pointer readPointer();
    void replacePointer(byte[] body, String expectedETag, Map<String, String> metadata);
}
