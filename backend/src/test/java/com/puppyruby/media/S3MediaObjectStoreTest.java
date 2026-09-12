package com.puppyruby.media;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.core.ResponseInputStream;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class S3MediaObjectStoreTest {
    MediaSettings settings(boolean enabled, String cdn) { return new MediaSettings(enabled, "puppyruby-test", "ap-northeast-2", "puppyruby", cdn, 300, 1048576); }

    @Test void realSdkOfflineSignatureBindsTypeLengthAndChecksumWithoutReturningForbiddenHeaders() {
        try (var signer = S3Presigner.builder().region(Region.AP_NORTHEAST_2)
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("OFFLINE_TEST_ACCESS_KEY", "offline-test-secret-not-a-real-credential"))).build()) {
            var store = new S3MediaObjectStore(settings(true, "https://images.example.test"));
            ReflectionTestUtils.setField(store, "presigner", signer);
            var upload = new MediaUpload(); upload.bucket = "puppyruby-test"; upload.objectKey = "puppyruby/walk-profiles/test.png";
            upload.contentType = "image/png"; upload.size = 123; upload.sha256 = Base64.getEncoder().encodeToString(new byte[32]);
            var result = store.presign(upload, 300);
            assertTrue(result.url().startsWith("https://")); assertTrue(result.url().contains("X-Amz-Signature="));
            String url = java.net.URLDecoder.decode(result.url(), java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(url.contains("content-length")); assertTrue(url.contains("content-type")); assertTrue(url.contains("x-amz-checksum-sha256"));
            assertEquals(upload.contentType, result.headers().get("content-type"));
            assertEquals(upload.sha256, result.headers().get("x-amz-checksum-sha256"));
            assertFalse(result.headers().containsKey("host")); assertFalse(result.headers().containsKey("content-length"));
        }
    }

    @Test void disabledEmptyAwsSettingsAreSafeAndUploadLimitsAreBounded() {
        var disabled = new MediaSettings(false, "", "ap-northeast-2", "puppyruby", "", 300, 1048576);
        assertFalse(disabled.enabled()); assertNull(disabled.imageUrl("test"));
        var store = new S3MediaObjectStore(disabled); store.close();
        var service = new MediaService(disabled, null, store, new MediaRateLimiter());
        assertFalse(service.config().enabled());
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.presign(UUID.randomUUID().toString(), null)).getStatusCode().value());
        var clamped = new MediaSettings(false, "", "", "", "", 99999, Integer.MAX_VALUE);
        assertEquals(900, clamped.ttlSeconds); assertEquals(5 * 1024 * 1024, clamped.maxBytes);
    }

    @Test void oversizedS3ResponseIsAbortedBeforeReadingOrDraining() throws Exception {
        var store = new S3MediaObjectStore(settings(true, "https://images.example.test"));
        var client = mock(S3Client.class);
        @SuppressWarnings("unchecked") ResponseInputStream<GetObjectResponse> response = mock(ResponseInputStream.class);
        when(response.response()).thenReturn(GetObjectResponse.builder().contentLength(50_000_000L).contentType("image/png").build());
        when(client.getObject(any(GetObjectRequest.class))).thenReturn(response);
        ReflectionTestUtils.setField(store, "client", client); ReflectionTestUtils.setField(store, "presigner", mock(S3Presigner.class));
        var upload = new MediaUpload(); upload.bucket = "puppyruby-test"; upload.objectKey = "test.png"; upload.size = 123;
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> store.read(upload, 1048576)).getStatusCode().value());
        verify(response).abort(); verify(response, never()).readNBytes(anyInt());
    }

    @Test void missingObjectDoesNotExposeS3Details() {
        var store = new S3MediaObjectStore(settings(true, "https://images.example.test")); var client = mock(S3Client.class);
        when(client.getObject(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().message("secret bucket path and signed URL").build());
        ReflectionTestUtils.setField(store, "client", client); ReflectionTestUtils.setField(store, "presigner", mock(S3Presigner.class));
        var upload = new MediaUpload(); upload.bucket = "puppyruby-test"; upload.objectKey = "test.png"; upload.size = 123;
        var error = assertThrows(ResponseStatusException.class, () -> store.read(upload, 1048576));
        assertEquals(409, error.getStatusCode().value()); assertFalse(error.getReason().contains("secret"));
    }

    @Test void invalidEnabledConfigAndUnsafeCdnBasesAreRejectedWithoutEchoingInput() {
        for (String cdn : List.of("http://images.example.test", "https://a:b@images.example.test", "https://images.example.test?token=secret",
            "https://images.example.test/#secret", "https://images.example.test/../bad", "https://images.example.test/%2fsecret")) {
            var error = assertThrows(IllegalArgumentException.class, () -> settings(true, cdn));
            assertFalse(error.getMessage().contains(cdn)); assertFalse(error.getMessage().contains("secret"));
        }
        assertThrows(IllegalArgumentException.class, () -> new MediaSettings(true, "", "ap-northeast-2", "puppyruby", "https://images.example.test", 300, 1024));
        assertThrows(IllegalArgumentException.class, () -> new MediaSettings(true, "puppyruby-test", "ap-northeast-2", "../other", "https://images.example.test", 300, 1024));
        assertEquals("https://images.example.test/base/key.png", settings(true, "https://images.example.test/base/").imageUrl("key.png"));
    }

    @Test void mediaResponsesCannotBeCachedIncludingFailurePaths() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/media/presign"); var response = new MockHttpServletResponse();
        new MediaResponseFilter().doFilter(request, response, (req, res) -> ((jakarta.servlet.http.HttpServletResponse)res).setStatus(401));
        assertEquals("private, no-store", response.getHeader("Cache-Control")); assertEquals("no-cache", response.getHeader("Pragma"));
        assertEquals(401, response.getStatus());
    }
}
