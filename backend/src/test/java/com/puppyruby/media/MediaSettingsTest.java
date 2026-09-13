package com.puppyruby.media;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class MediaSettingsTest {
    private MediaSettings settings(boolean enabled, String prefix, String origin) {
        return new MediaSettings(enabled, "puppyruby-test", "ap-northeast-2", prefix,
            "https://images.example.test", origin, 300, 1048576);
    }

    @Test void bucketRootAndLegacyConstructorKeepTheEntireObjectKey() {
        var legacy = new MediaSettings(true, "puppyruby-test", "ap-northeast-2", "puppyruby",
            "https://images.example.test/base/", 300, 1048576);
        assertEquals("https://images.example.test/base/puppyruby/walk-profiles/file.png", legacy.imageUrl("puppyruby/walk-profiles/file.png"));
        for (String origin : List.of("", " ", "/")) {
            assertEquals("https://images.example.test/puppyruby/walk-profiles/file.png",
                settings(true, "puppyruby", origin).imageUrl("puppyruby/walk-profiles/file.png"));
        }
    }

    @Test void removesOnlyOneExactOriginPrefixAndPreservesS3UploadPrefix() {
        for (String origin : List.of("puppyruby", "/puppyruby", "puppyruby/", " /puppyruby/ ")) {
            var config = settings(true, "puppyruby", origin);
            assertEquals("puppyruby", config.prefix);
            assertEquals("https://images.example.test/walk-profiles/file.png", config.imageUrl("puppyruby/walk-profiles/file.png"));
            assertEquals("https://images.example.test/seo-shares/file.jpg", config.imageUrl("puppyruby/seo-shares/file.jpg"));
            assertEquals("https://images.example.test/puppyruby/file.png", config.imageUrl("puppyruby/puppyruby/file.png"));
        }
        var nested = settings(true, "tenant/puppyruby/uploads", "/tenant/puppyruby");
        assertEquals("https://images.example.test/uploads/walk-profiles/file.png", nested.imageUrl("tenant/puppyruby/uploads/walk-profiles/file.png"));
    }

    @Test void objectKeysOutsideTheOriginAreNotExposed() {
        var config = settings(true, "puppyruby", "puppyruby");
        for (String key : List.of("other/file.png", "puppyruby-other/file.png", "puppyruby2/file.png", "PuppyRuby/file.png",
            "puppyruby", "puppyruby/", "/puppyruby/file.png")) assertNull(config.imageUrl(key));
    }

    @Test void rejectsObjectKeyTraversalAndUrlSyntaxEvenWithBucketRootOrigin() {
        for (String origin : List.of("", "puppyruby")) {
            var config = settings(true, "puppyruby", origin);
            assertNull(config.imageUrl(null));
            for (String key : List.of("", "puppyruby/../private.png", "puppyruby/./file.png", "puppyruby//file.png",
                "puppyruby/%2e%2e/private.png", "puppyruby/%252e%252e/private.png", "puppyruby/%2ffile.png",
                "puppyruby\\file.png", "puppyruby/file.png?secret=x", "puppyruby/file.png#x", "https://other/file.png",
                "puppyruby/file name.png", "puppyruby/" + "x".repeat(1024))) assertNull(config.imageUrl(key));
        }
    }

    @Test void invalidOriginsAreRejectedWithoutEchoingTheValue() {
        for (String origin : List.of("../secret-marker", "a/../secret-marker", "a/./secret-marker", "a//secret-marker",
            "//secret-marker", "secret-marker//", "a\\secret-marker", "a/%2esecret-marker", "a?secret-marker",
            "https://secret-marker", "secret marker", "a#secret-marker")) {
            var error = assertThrows(IllegalArgumentException.class, () -> settings(false, "", origin));
            assertTrue(error.getMessage().contains("CDN_ORIGIN_PATH"));
            assertFalse(error.getMessage().contains("secret-marker"));
        }
    }

    @Test void enabledUploadsMustBeInsideTheOriginButDisabledUploadsCanStillReadExistingPhotos() {
        for (String prefix : List.of("outside", "puppyruby2", "parent")) {
            assertThrows(IllegalArgumentException.class, () -> settings(true, prefix, "puppyruby"));
        }
        var disabled = settings(false, "", "puppyruby");
        assertFalse(disabled.enabled());
        assertEquals("https://images.example.test/walk-profiles/existing.png", disabled.imageUrl("puppyruby/walk-profiles/existing.png"));
        assertNull(disabled.imageUrl("outside/existing.png"));
        var noCdn = new MediaSettings(false, "", "", "", "", "puppyruby", 300, 1024);
        assertNull(noCdn.imageUrl("puppyruby/existing.png"));
    }
}
