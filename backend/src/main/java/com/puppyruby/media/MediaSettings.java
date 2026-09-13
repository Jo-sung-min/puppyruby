package com.puppyruby.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.List;

@Component
public class MediaSettings {
    public static final List<String> TYPES = List.of("image/jpeg", "image/png");
    final boolean enabled;
    final String bucket, region, prefix, cdnBase, cdnOriginPath;
    final int ttlSeconds, maxBytes;

    @Autowired
    public MediaSettings(@Value("${S3_UPLOAD_ENABLED:false}") boolean enabled,
                         @Value("${S3_BUCKET:}") String bucket,
                         @Value("${AWS_REGION:ap-northeast-2}") String region,
                         @Value("${S3_KEY_PREFIX:puppyruby}") String prefix,
                         @Value("${CDN_BASE_URL:}") String cdnBase,
                         @Value("${CDN_ORIGIN_PATH:}") String cdnOriginPath,
                         @Value("${S3_PRESIGN_TTL_SECONDS:300}") int ttlSeconds,
                         @Value("${S3_MAX_UPLOAD_BYTES:1048576}") int maxBytes) {
        this.enabled = enabled; this.bucket = bucket.strip(); this.region = region.strip();
        this.prefix = prefix.strip().replaceAll("/+$", ""); this.cdnBase = normalizeCdn(cdnBase);
        this.cdnOriginPath = normalizeOriginPath(cdnOriginPath);
        this.ttlSeconds = Math.clamp(ttlSeconds, 60, 900);
        this.maxBytes = Math.clamp(maxBytes, 1, 5 * 1024 * 1024);
        if (enabled && (!this.bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")
            || this.bucket.contains("..") || !this.region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]")
            || !this.prefix.matches("[A-Za-z0-9][A-Za-z0-9/_-]{0,100}") || this.cdnBase.isEmpty())) {
            throw new IllegalArgumentException("S3_BUCKET, AWS_REGION, S3_KEY_PREFIX, CDN_BASE_URL 설정을 확인해 주세요.");
        }
        if (enabled && !this.cdnOriginPath.isEmpty() && !(this.prefix.equals(this.cdnOriginPath)
            || this.prefix.startsWith(this.cdnOriginPath + "/"))) {
            throw new IllegalArgumentException("S3_KEY_PREFIX는 CDN_ORIGIN_PATH 안의 경로여야 해요.");
        }
    }

    /** Existing callers use a CDN whose origin is the bucket root. */
    public MediaSettings(boolean enabled, String bucket, String region, String prefix, String cdnBase, int ttlSeconds, int maxBytes) {
        this(enabled, bucket, region, prefix, cdnBase, "", ttlSeconds, maxBytes);
    }

    public boolean enabled() { return enabled; }

    private static String normalizeCdn(String value) {
        String base = value.strip().replaceAll("/+$", "");
        if (base.isEmpty()) return "";
        try {
            URI uri = URI.create(base);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().matches("(?:/[A-Za-z0-9_-]+)*"))
                throw new IllegalArgumentException();
            return base;
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("CDN_BASE_URL에는 HTTPS 이미지 도메인을 설정해 주세요.");
        }
    }

    private static String normalizeOriginPath(String value) {
        String origin = value == null ? "" : value.strip().replaceAll("^/|/$", "");
        if (origin.isEmpty()) return "";
        if (origin.length() > 1024 || !origin.matches("[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*"))
            throw new IllegalArgumentException("CDN_ORIGIN_PATH에는 CDN 원본의 폴더 경로만 입력해 주세요.");
        return origin;
    }

    String imageUrl(String key) {
        if (cdnBase.isEmpty() || key == null || key.length() > 1024
            || !key.matches("[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*")) return null;
        for (String segment : key.split("/")) if (segment.equals(".") || segment.equals("..")) return null;
        if (!cdnOriginPath.isEmpty()) {
            String originPrefix = cdnOriginPath + "/";
            if (!key.startsWith(originPrefix)) return null;
            key = key.substring(originPrefix.length());
        }
        return cdnBase + "/" + key;
    }
}
