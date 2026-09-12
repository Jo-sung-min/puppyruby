package com.puppyruby.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.List;

@Component
public class MediaSettings {
    public static final List<String> TYPES = List.of("image/jpeg", "image/png");
    final boolean enabled;
    final String bucket, region, prefix, cdnBase;
    final int ttlSeconds, maxBytes;

    public MediaSettings(@Value("${S3_UPLOAD_ENABLED:false}") boolean enabled,
                         @Value("${S3_BUCKET:}") String bucket,
                         @Value("${AWS_REGION:ap-northeast-2}") String region,
                         @Value("${S3_KEY_PREFIX:puppyruby}") String prefix,
                         @Value("${CDN_BASE_URL:}") String cdnBase,
                         @Value("${S3_PRESIGN_TTL_SECONDS:300}") int ttlSeconds,
                         @Value("${S3_MAX_UPLOAD_BYTES:1048576}") int maxBytes) {
        this.enabled = enabled; this.bucket = bucket.strip(); this.region = region.strip();
        this.prefix = prefix.strip().replaceAll("/+$", ""); this.cdnBase = normalizeCdn(cdnBase);
        this.ttlSeconds = Math.clamp(ttlSeconds, 60, 900);
        this.maxBytes = Math.clamp(maxBytes, 1, 5 * 1024 * 1024);
        if (enabled && (!this.bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")
            || this.bucket.contains("..") || !this.region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]")
            || !this.prefix.matches("[A-Za-z0-9][A-Za-z0-9/_-]{0,100}") || this.cdnBase.isEmpty())) {
            throw new IllegalArgumentException("S3_BUCKET, AWS_REGION, S3_KEY_PREFIX, CDN_BASE_URL 설정을 확인해 주세요.");
        }
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

    String imageUrl(String key) { return cdnBase.isEmpty() ? null : cdnBase + "/" + key; }
}
