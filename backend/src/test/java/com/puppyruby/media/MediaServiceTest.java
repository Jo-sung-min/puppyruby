package com.puppyruby.media;

import com.puppyruby.auth.AuthService;
import com.puppyruby.walk.WalkService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:media-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "S3_UPLOAD_ENABLED=true", "S3_BUCKET=puppyruby-test", "AWS_REGION=ap-northeast-2",
    "S3_KEY_PREFIX=puppyruby", "CDN_BASE_URL=https://images.puppyruby.test", "MAIL_ENABLED=false"
})
class MediaServiceTest {
    @Autowired MediaService media;
    @Autowired MediaUploadRepository uploads;
    @Autowired MediaSettings settings;
    @Autowired WalkService walk;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthService auth;
    @Autowired MediaController controller;
    @MockitoBean MediaObjectStore storage;

    @BeforeEach void setup() {
        reset(storage);
        when(storage.presign(any(), anyInt())).thenAnswer(invocation -> {
            MediaUpload upload = invocation.getArgument(0);
            return new MediaObjectStore.SignedUpload("https://s3.example.test/signed", Map.of("content-type", upload.contentType, "x-amz-checksum-sha256", upload.sha256));
        });
    }
    String owner() { return UUID.randomUUID().toString(); }
    byte[] png(int width, int height) throws Exception {
        var out = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out); return out.toByteArray();
    }
    String hash(byte[] bytes) throws Exception { return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    MediaService.Presigned presign(String owner, byte[] bytes) throws Exception {
        return media.presign(owner, new MediaService.Input("image/png", (long) bytes.length, hash(bytes)));
    }
    void stored(byte[] bytes) { doReturn(new MediaObjectStore.StoredImage("image/png", bytes.length, bytes)).when(storage).read(any(), anyInt()); }
    MediaService.Completed completed(String owner) throws Exception {
        byte[] bytes = png(2, 2); var signed = presign(owner, bytes); stored(bytes);
        return media.complete(owner, new MediaService.Complete(signed.uploadId()));
    }
    void bad(Runnable action) { assertEquals(400, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value()); }
    WalkService.Action action(Map<String, Object> value) { return mapper.convertValue(value, WalkService.Action.class); }
    WalkService.State profile(String owner, String photo) {
        var fields = new HashMap<String, Object>(); fields.put("nickname", "사진친구"); fields.put("realName", "비공개 이름"); fields.put("photo", photo);
        return walk.act(owner, "profile", action(fields)).state();
    }

    @Test void presignPersistsOwnedRandomObjectAndPublicConfigContainsNoInfrastructure() throws Exception {
        String owner = owner(); byte[] bytes = png(2, 2); var result = presign(owner, bytes);
        var upload = uploads.findById(result.uploadId()).orElseThrow();
        assertEquals(owner, upload.ownerPlayerId); assertEquals(bytes.length, upload.size); assertEquals(hash(bytes), upload.sha256);
        assertTrue(upload.objectKey.matches("puppyruby/walk-profiles/[0-9a-f-]{36}\\.png"));
        assertFalse(upload.objectKey.contains(owner)); assertNull(upload.completedAt); assertEquals("PUT", result.method());
        assertTrue(result.expiresAt() > System.currentTimeMillis()); assertEquals("image/png", result.headers().get("content-type"));
        String config = mapper.writeValueAsString(media.config());
        assertEquals(Set.of("enabled", "maxBytes", "acceptedTypes"), mapper.readTree(config).propertyNames().stream().collect(java.util.stream.Collectors.toSet()));
        assertFalse(config.contains(settings.bucket)); assertFalse(config.contains("https://"));
    }

    @Test void invalidMetadataIsRejectedBeforeSigningOrSaving() throws Exception {
        String checksum = hash(png(1, 1));
        for (MediaService.Input input : Arrays.asList(null,
            new MediaService.Input("image/svg+xml", 10L, checksum), new MediaService.Input("image/webp", 10L, checksum),
            new MediaService.Input("image/png", 0L, checksum), new MediaService.Input("image/png", -1L, checksum),
            new MediaService.Input("image/png", 5_242_881L, checksum), new MediaService.Input("image/png", null, checksum),
            new MediaService.Input("image/png", 10L, "invalid"), new MediaService.Input("image/png", 10L, null))) {
            bad(() -> media.presign(owner(), input));
        }
        verify(storage, never()).presign(any(), anyInt());
    }

    @Test void completionChecksUploadedBytesAndIsIdempotentAfterExpiry() throws Exception {
        String owner = owner(); byte[] bytes = png(2, 2); var signed = presign(owner, bytes); stored(bytes);
        bad(() -> media.ownedReference(owner, "media:" + signed.uploadId()));
        assertNull(media.resolve("media:" + signed.uploadId()));
        var result = media.complete(owner, new MediaService.Complete(signed.uploadId()));
        assertEquals("media:" + signed.uploadId(), result.photo()); assertTrue(result.url().startsWith("https://images.puppyruby.test/puppyruby/walk-profiles/"));
        assertEquals(result.photo(), media.ownedReference(owner, result.photo())); assertEquals(result.url(), media.resolve(result.photo()));
        var entity = uploads.findById(signed.uploadId()).orElseThrow(); entity.expiresAt = 1; uploads.saveAndFlush(entity);
        assertEquals(result, media.complete(owner, new MediaService.Complete(signed.uploadId())));
        verify(storage, times(1)).read(any(), anyInt());
    }

    @Test void ownersExpiryAndMissingUploadPreventStorageReads() throws Exception {
        String owner = owner(); var signed = presign(owner, png(1, 1));
        bad(() -> media.complete(owner(), new MediaService.Complete(signed.uploadId())));
        bad(() -> media.complete(owner, new MediaService.Complete(UUID.randomUUID().toString())));
        bad(() -> media.complete(owner, new MediaService.Complete("not-an-id")));
        var entity = uploads.findById(signed.uploadId()).orElseThrow(); entity.expiresAt = 1; uploads.saveAndFlush(entity);
        bad(() -> media.complete(owner, new MediaService.Complete(signed.uploadId())));
        verify(storage, never()).read(any(), anyInt());
    }

    @Test void failedContentTypeSizeChecksumAndImageDecodeNeverComplete() throws Exception {
        byte[] bytes = png(2, 2), other = png(3, 3), invalid = new byte[] {(byte)137, 80, 78, 71, 13, 10, 26, 10};
        for (var stored : List.of(
            new MediaObjectStore.StoredImage("image/jpeg", bytes.length, bytes),
            new MediaObjectStore.StoredImage("image/png", bytes.length + 1, bytes),
            new MediaObjectStore.StoredImage("image/png", bytes.length, other))) {
            String owner = owner(); var signed = presign(owner, bytes); when(storage.read(any(), anyInt())).thenReturn(stored);
            bad(() -> media.complete(owner, new MediaService.Complete(signed.uploadId())));
            assertNull(uploads.findById(signed.uploadId()).orElseThrow().completedAt);
        }
        for (byte[] rejected : List.of(invalid, png(1025, 1), png(1, 1025))) {
            String owner = owner(); var signed = presign(owner, rejected); stored(rejected);
            bad(() -> media.complete(owner, new MediaService.Complete(signed.uploadId())));
            assertNull(uploads.findById(signed.uploadId()).orElseThrow().completedAt);
        }
    }

    @Test void unfinishedUploadCanBeRetriedAndErrorsDoNotLeakStorageDetails() throws Exception {
        String owner = owner(); byte[] bytes = png(1, 1); var signed = presign(owner, bytes);
        when(storage.read(any(), anyInt())).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "업로드 확인 중"));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> media.complete(owner, new MediaService.Complete(signed.uploadId()))).getStatusCode().value());
        assertNull(uploads.findById(signed.uploadId()).orElseThrow().completedAt);
        stored(bytes); assertNotNull(media.complete(owner, new MediaService.Complete(signed.uploadId())));
    }

    @Test void profileAcceptsOnlyOwnCompletedReferenceAndUnchangedCdn() throws Exception {
        String owner = owner(); var result = completed(owner);
        bad(() -> profile(owner(), result.photo()));
        bad(() -> profile(owner, "https://external.example/photo.png"));
        var pending = presign(owner, png(1, 1)); bad(() -> profile(owner, "media:" + pending.uploadId()));
        assertEquals(result.url(), profile(owner, result.photo()).me().photo());
        assertEquals(result.url(), profile(owner, result.url()).me().photo());
        assertEquals(result.photo(), jdbc.queryForObject("select photo from walk_profiles where player_id = ?", String.class, owner));
        assertNull(profile(owner, null).me().photo());
        bad(() -> profile(owner, result.url()));
    }

    @Test void unchangedLegacyPhotoSurvivesButNewBase64IsRejectedWhenUploadsEnabled() throws Exception {
        String owner = owner(); walk.state(owner);
        String legacy = "data:image/png;base64," + Base64.getEncoder().encodeToString(png(1, 1));
        jdbc.update("update walk_profiles set photo = ? where player_id = ?", legacy, owner);
        assertEquals(legacy, profile(owner, legacy).me().photo());
        bad(() -> profile(owner(), legacy));
        assertNull(profile(owner, null).me().photo());
    }

    @Test void cdnPhotoIsExposedOnlyAfterMutualFriendAcceptanceAndHiddenOnRemoval() throws Exception {
        String owner = owner(), visitor = owner(); var image = completed(owner);
        profile(owner, image.photo()); profile(visitor, null);
        var room = walk.act(owner, "create", action(Map.of("title", "사진 산책", "description", "사진", "theme", "meadow", "capacity", 4))).state().room();
        walk.act(visitor, "join", action(Map.of("roomId", room.id())));
        assertNull(walk.state(visitor).room().owner().photo());
        String ownerProfile = walk.state(owner).me().id(), visitorProfile = walk.state(visitor).me().id();
        walk.act(visitor, "friend-request", action(Map.of("targetId", ownerProfile)));
        assertNull(walk.state(visitor).room().owner().photo());
        walk.act(owner, "friend-accept", action(Map.of("targetId", visitorProfile)));
        assertEquals(image.url(), walk.state(visitor).room().owner().photo());
        assertEquals(image.url(), walk.state(visitor).friends().getFirst().photo());
        walk.act(visitor, "friend-remove", action(Map.of("targetId", ownerProfile)));
        assertNull(walk.state(visitor).room().owner().photo());
    }

    @Test void postsRequireActiveSessionAndDoNotAcceptGuestIdentity() throws Exception {
        byte[] bytes = png(1, 1); var input = new MediaService.Input("image/png", (long) bytes.length, hash(bytes));
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> controller.presign(null, input)).getStatusCode().value());
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> controller.complete(null, new MediaService.Complete(owner()))).getStatusCode().value());
        var account = auth.register(owner(), new AuthService.Register("media-" + owner() + "@puppyruby.test", "Puppy-Media-Test-2026!", "사진 계정"));
        var signed = controller.presign(account.token(), input);
        assertEquals(auth.requireAccount(account.token()).playerId, uploads.findById(signed.uploadId()).orElseThrow().ownerPlayerId);
        jdbc.update("update accounts set status = 'SUSPENDED' where id = ?", account.user().id());
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> controller.complete(account.token(), new MediaService.Complete(signed.uploadId()))).getStatusCode().value());
    }

    @Test void repeatedUploadRequestsAreLimited() throws Exception {
        String owner = owner(); byte[] bytes = png(1, 1);
        for (int count = 0; count < 10; count++) presign(owner, bytes);
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> presign(owner, bytes)).getStatusCode().value());
    }
}
