package com.puppyruby.media;

import java.util.Map;

interface MediaObjectStore {
    record SignedUpload(String url, Map<String, String> headers) {}
    record StoredImage(String contentType, long contentLength, byte[] bytes) {}
    SignedUpload presign(MediaUpload upload, int ttlSeconds);
    StoredImage read(MediaUpload upload, int maxBytes);
}
