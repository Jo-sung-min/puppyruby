package com.puppyruby.admin;

import java.util.List;

interface DesktopReleaseCdnVerifier {
    record Asset(String name, String url, long size, String sha256Hex, String contentType,
                 String contentDisposition, String cacheControl) {}
    void verify(List<Asset> assets);
}
