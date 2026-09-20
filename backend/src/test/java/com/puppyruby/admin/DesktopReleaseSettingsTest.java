package com.puppyruby.admin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DesktopReleaseSettingsTest {
    @Test
    void enabledPublisherRequiresTheExactProductionS3AndCdnBoundary() {
        var settings = enabled("fatell-aws-s3", "ap-northeast-2", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 300);

        assertTrue(settings.enabled);
        assertEquals("ap-northeast-2", settings.region);
        assertEquals(300, settings.ttlSeconds);

        assertThrows(IllegalArgumentException.class, () -> enabled("fatell-aws-s3", "us-east-1", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 300));
        assertThrows(IllegalArgumentException.class, () -> enabled("fatell-aws-s3", "ap-northeast-1", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 300));
        assertThrows(IllegalArgumentException.class, () -> enabled("another-bucket", "ap-northeast-2", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 300));
        assertThrows(IllegalArgumentException.class, () -> enabled("fatell-aws-s3", "ap-northeast-2", "another-prefix",
            "https://cdn.puppyruby.com", "puppyruby", 300));
        assertThrows(IllegalArgumentException.class, () -> enabled("fatell-aws-s3", "ap-northeast-2", "puppyruby",
            "https://other.example", "puppyruby", 300));
    }

    @Test
    void disabledPublisherDoesNotRequireReleaseStorageConfiguration() {
        var settings = new DesktopReleaseSettings(false, "", "", "", "", "", 12);

        assertFalse(settings.enabled);
        assertEquals("", settings.region);
        assertEquals(60, settings.ttlSeconds);
    }

    @Test
    void presignTtlIsBounded() {
        assertEquals(60, enabled("fatell-aws-s3", "ap-northeast-2", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 1).ttlSeconds);
        assertEquals(900, enabled("fatell-aws-s3", "ap-northeast-2", "puppyruby",
            "https://cdn.puppyruby.com", "puppyruby", 3_600).ttlSeconds);
    }

    private static DesktopReleaseSettings enabled(String bucket, String region, String prefix,
                                                   String cdnBase, String cdnOriginPath, int ttlSeconds) {
        return new DesktopReleaseSettings(true, bucket, region, prefix, cdnBase, cdnOriginPath, ttlSeconds);
    }
}
