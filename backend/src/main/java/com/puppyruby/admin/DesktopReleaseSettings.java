package com.puppyruby.admin;

import java.net.URI;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Restricted settings for the administrator-only Windows release publisher. */
@Component
class DesktopReleaseSettings {
    static final String BUCKET = "fatell-aws-s3";
    static final String REGION = "ap-northeast-2";
    static final String KEY_ROOT = "puppyruby/site-downloads";
    static final String POINTER_KEY = KEY_ROOT + "/latest-desktop-update.json";
    static final String CDN_ROOT = "https://cdn.puppyruby.com/site-downloads";
    static final String EXECUTABLE_TYPE = "application/vnd.microsoft.portable-executable";
    static final String IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
    static final String POINTER_CACHE = "private, no-store, max-age=0";
    static final long MAX_FILE_BYTES = 200L * 1024 * 1024;

    final boolean enabled;
    final String region;
    final int ttlSeconds;

    @Autowired
    DesktopReleaseSettings(@Value("${DESKTOP_RELEASE_UPLOAD_ENABLED:false}") boolean enabled,
                           @Value("${S3_BUCKET:}") String bucket,
                           @Value("${AWS_REGION:ap-northeast-2}") String region,
                           @Value("${S3_KEY_PREFIX:puppyruby}") String prefix,
                           @Value("${CDN_BASE_URL:}") String cdnBase,
                           @Value("${CDN_ORIGIN_PATH:}") String cdnOriginPath,
                           @Value("${S3_PRESIGN_TTL_SECONDS:300}") int ttlSeconds) {
        this.enabled = enabled;
        this.region = region == null ? "" : region.strip();
        this.ttlSeconds = Math.clamp(ttlSeconds, 60, 900);
        if (!enabled) return;
        String cleanBucket = bucket == null ? "" : bucket.strip();
        String cleanPrefix = prefix == null ? "" : prefix.strip().replaceAll("/+$", "");
        if (!BUCKET.equals(cleanBucket) || !"puppyruby".equals(cleanPrefix)
            || !REGION.equals(this.region)) {
            throw new IllegalArgumentException("Windows 릴리스 S3 대상과 AWS_REGION 설정을 확인해 주세요.");
        }
        String origin = cdnOriginPath == null ? "" : cdnOriginPath.strip().replaceAll("^/+|/+$", "");
        String base = normalizeCdn(cdnBase);
        String publicRoot = base + "/" + (origin.isEmpty() ? KEY_ROOT : stripOrigin(KEY_ROOT, origin));
        if (!CDN_ROOT.equals(publicRoot))
            throw new IllegalArgumentException("Windows 릴리스 CDN 경로는 cdn.puppyruby.com/site-downloads여야 해요.");
    }

    DesktopReleaseSettings(boolean enabled, String region, int ttlSeconds) {
        this.enabled = enabled;
        this.region = region;
        this.ttlSeconds = Math.clamp(ttlSeconds, 60, 900);
    }

    String binaryKey(String release, String name) { return KEY_ROOT + "/" + release + "/downloads/" + name; }
    String downloadUrl(String release, String name) { return CDN_ROOT + "/" + release + "/downloads/" + name; }

    private static String stripOrigin(String key, String origin) {
        if (!key.startsWith(origin + "/")) throw new IllegalArgumentException("CDN_ORIGIN_PATH가 S3 경로와 맞지 않아요.");
        return key.substring(origin.length() + 1);
    }

    private static String normalizeCdn(String value) {
        String base = value == null ? "" : value.strip().replaceAll("/+$", "");
        try {
            URI uri = URI.create(base);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().matches("(?:/[A-Za-z0-9_-]+)*"))
                throw new IllegalArgumentException();
            return base;
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Windows 릴리스 CDN 설정을 확인해 주세요.");
        }
    }
}
