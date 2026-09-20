package com.puppyruby.admin;

import com.puppyruby.auth.Account;
import com.puppyruby.auth.AuthService;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class DesktopReleaseServiceTest {
    DesktopReleaseSettings settings = new DesktopReleaseSettings(true, "ap-northeast-2", 300);
    MemoryStore storage;
    MemoryCdn cdn;
    AuthService auth;
    AdminAuditRepository audits;
    DesktopReleaseService service;
    Account actor;
    byte[] executable;
    byte[] installer;

    @BeforeEach
    void setup() {
        storage = new MemoryStore(); cdn = new MemoryCdn(storage); auth = mock(AuthService.class); audits = mock(AdminAuditRepository.class);
        actor = new Account(); actor.id = "admin-id"; actor.role = Account.Role.ADMIN; actor.emailVerified = true;
        when(auth.requireAdmin("admin-token")).thenReturn(actor);
        service = new DesktopReleaseService(settings, storage, cdn, auth, audits, new ObjectMapper());
        executable = pe("0.10.3.0", (byte) 1); installer = pe("0.10.3.0", (byte) 2);
    }

    DesktopReleaseService.PrepareInput input(String version, String notes, byte[] exe, byte[] setup) {
        return new DesktopReleaseService.PrepareInput(version, notes, List.of(
            new DesktopReleaseService.FileInput("PuppyRuby.exe", (long) exe.length, checksum(exe)),
            new DesktopReleaseService.FileInput("PuppyRuby-Setup.exe", (long) setup.length, checksum(setup))));
    }

    DesktopReleaseService.CompleteInput complete(DesktopReleaseService.PrepareInput input, String release) {
        return new DesktopReleaseService.CompleteInput(input.version(), input.notes(), release, input.files());
    }

    @Test
    void prepareSignsOnlyTheTwoExactImmutableExecutableKeysAndIsStateless() {
        var input = input("0.10.3.0", "관리자 업로드 검증", executable, installer);
        var prepared = service.prepare("admin-token", input);
        assertTrue(prepared.release().matches("[a-f0-9]{16}"));
        assertEquals(List.of("PuppyRuby-Setup.exe", "PuppyRuby.exe"), prepared.uploads().stream().map(DesktopReleaseService.Upload::name).toList());
        assertTrue(prepared.uploads().stream().allMatch(DesktopReleaseService.Upload::required));
        assertEquals(2, storage.presigned.size());
        for (var upload : storage.presigned.values()) {
            assertTrue(upload.key().matches("puppyruby/site-downloads/" + prepared.release() + "/downloads/PuppyRuby(?:-Setup)?\\.exe"));
            assertEquals(DesktopReleaseSettings.EXECUTABLE_TYPE, upload.contentType());
            assertEquals(DesktopReleaseSettings.IMMUTABLE_CACHE, upload.cacheControl());
            assertEquals(upload.sha256Hex(), storage.presignHeaders(upload).get("x-amz-meta-sha256"));
            assertEquals(upload.checksumBase64(), storage.presignHeaders(upload).get("x-amz-checksum-sha256"));
        }
        verify(auth).requireAdmin("admin-token");
        verifyNoInteractions(audits);
    }

    @Test
    void releaseIdMatchesTheExistingWindowsPublisherFourFileContract() {
        var input = new DesktopReleaseService.PrepareInput("0.10.2.0", "동일 계약", List.of(
            new DesktopReleaseService.FileInput("PuppyRuby.exe", 62_697_984L,
                base64("20d7ac095b020265540976576093bcba2ba98a32c16bced5e82f50e3198bc15c")),
            new DesktopReleaseService.FileInput("PuppyRuby-Setup.exe", 62_727_680L,
                base64("3371e9ca9a532c5ecbaaa60ddf6c5cc8e29abe311038d1b06cbc90a260e2950a"))));
        assertEquals("b43d80c122b4910c", service.prepare("admin-token", input).release());
    }

    @Test
    void completeVerifiesHeadAndPeCreatesSidecarsThenConditionallyPublishesPointerAndAudits() throws Exception {
        var input = input("0.10.3.0", "새 메뉴와 자동 업데이트", executable, installer);
        var prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", executable);
        storage.upload("PuppyRuby-Setup.exe", installer);

        var manifest = service.complete("admin-token", complete(input, prepared.release()));
        assertEquals(1, manifest.schemaVersion());
        assertEquals("0.10.3.0", manifest.version());
        assertEquals(prepared.release(), manifest.release());
        assertEquals("새 메뉴와 자동 업데이트", manifest.notes());
        assertEquals("https://cdn.puppyruby.com/site-downloads/" + prepared.release() + "/downloads/PuppyRuby-Setup.exe",
            manifest.installer().url());
        assertEquals(installer.length, manifest.installer().size());
        assertEquals(4, storage.objects.size());
        assertEquals(hex(executable).toUpperCase(java.util.Locale.ROOT) + "  PuppyRuby.exe\r\n",
            new String(storage.objects.get(settings.binaryKey(prepared.release(), "PuppyRuby.sha256")).body, StandardCharsets.UTF_8));
        assertEquals(hex(installer).toUpperCase(java.util.Locale.ROOT) + "  PuppyRuby-Setup.exe\r\n",
            new String(storage.objects.get(settings.binaryKey(prepared.release(), "PuppyRuby-Setup.sha256")).body, StandardCharsets.UTF_8));
        assertNotNull(storage.pointer);
        assertEquals(1, cdn.calls);
        assertEquals(Map.of("release", prepared.release(), "version", "0.10.3.0"), storage.pointerMetadata);

        var audit = ArgumentCaptor.forClass(AdminAudit.class);
        verify(audits).save(audit.capture());
        assertEquals("DESKTOP_RELEASE", audit.getValue().targetType);
        assertEquals(prepared.release(), audit.getValue().targetId);
        assertEquals("DESKTOP_RELEASE_PUBLISH", audit.getValue().action);

        // Replaying complete is safe and keeps the original publishedAt/pointer body.
        byte[] firstPointer = storage.pointer.clone();
        var repeated = service.complete("admin-token", complete(input, prepared.release()));
        assertEquals(manifest, repeated);
        assertArrayEquals(firstPointer, storage.pointer);
        assertEquals(2, cdn.calls);
        verify(audits, times(2)).save(any());
    }

    @Test
    void completeRejectsMissingOrMutatedObjectsAndInvalidPeBeforePublishing() {
        var input = input("0.10.3.0", "검증", executable, installer);
        var prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", executable);
        assertStatus(409, () -> service.complete("admin-token", complete(input, prepared.release())));
        assertNull(storage.pointer);

        storage.upload("PuppyRuby-Setup.exe", installer);
        var setupKey = settings.binaryKey(prepared.release(), "PuppyRuby-Setup.exe");
        storage.objects.get(setupKey).upload = new DesktopReleaseObjectStore.UploadObject(setupKey, "PuppyRuby-Setup.exe",
            installer.length, checksum(installer), "0".repeat(64), DesktopReleaseSettings.EXECUTABLE_TYPE,
            "attachment; filename=\"PuppyRuby-Setup.exe\"", DesktopReleaseSettings.IMMUTABLE_CACHE);
        assertStatus(409, () -> service.complete("admin-token", complete(input, prepared.release())));
        assertNull(storage.pointer);

        storage.objects.get(setupKey).upload = storage.presigned.get("PuppyRuby-Setup.exe");
        storage.objects.get(setupKey).body[0] = 'N';
        assertStatus(409, () -> service.complete("admin-token", complete(input, prepared.release())));
        assertNull(storage.pointer);
        verifyNoInteractions(audits);
    }

    @Test
    void completeRejectsEachExecutableWhenItsRealFileVersionDiffersOrVersionInfoIsMissing() {
        for (String mismatched : List.of("PuppyRuby.exe", "PuppyRuby-Setup.exe")) {
            storage.presigned.clear(); storage.objects.clear(); storage.pointer = null; storage.eTag = null; cdn.calls = 0;
            byte[] exe = pe(mismatched.equals("PuppyRuby.exe") ? "0.10.2.0" : "0.10.3.0", (byte) 5);
            byte[] setup = pe(mismatched.equals("PuppyRuby-Setup.exe") ? "0.10.2.0" : "0.10.3.0", (byte) 6);
            var input = input("0.10.3.0", "버전 혼합 방지", exe, setup);
            var prepared = service.prepare("admin-token", input);
            storage.upload("PuppyRuby.exe", exe); storage.upload("PuppyRuby-Setup.exe", setup);
            var error = assertThrows(ResponseStatusException.class, () -> service.complete("admin-token", complete(input, prepared.release())));
            assertEquals(409, error.getStatusCode().value());
            assertTrue(error.getReason().contains(mismatched));
            assertNull(storage.pointer); assertEquals(0, cdn.calls);
        }
        storage.presigned.clear(); storage.objects.clear();
        byte[] noVersion = pe("0.10.3.0", (byte) 7); noVersion[0x410] = 0; noVersion[0x411] = 0;
        var input = input("0.10.3.0", "VERSIONINFO 필수", noVersion, installer);
        var prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", noVersion); storage.upload("PuppyRuby-Setup.exe", installer);
        assertStatus(409, () -> service.complete("admin-token", complete(input, prepared.release())));
        assertNull(storage.pointer); assertEquals(0, cdn.calls);
        verifyNoInteractions(audits);
    }

    @Test
    void cdnMustVerifyAllFourObjectsBeforeTheLatestPointerCanChange() {
        var input = input("0.10.3.0", "CDN 확인", executable, installer);
        var prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", executable); storage.upload("PuppyRuby-Setup.exe", installer);
        cdn.failure = new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "CDN 전파 전");
        assertStatus(409, () -> service.complete("admin-token", complete(input, prepared.release())));
        assertEquals(1, cdn.calls); assertNull(storage.pointer);
        verifyNoInteractions(audits);
    }

    @Test
    void validationRejectsUnsafeMetadataAndWrongFileInventoryWithoutTouchingS3() {
        var valid = input("0.10.3.0", "설명", executable, installer);
        var wrongName = new DesktopReleaseService.PrepareInput(valid.version(), valid.notes(), List.of(
            valid.files().getFirst(), new DesktopReleaseService.FileInput("Other.exe", 12L, valid.files().getLast().sha256())));
        var duplicate = new DesktopReleaseService.PrepareInput(valid.version(), valid.notes(), List.of(valid.files().getFirst(), valid.files().getFirst()));
        var badHash = new DesktopReleaseService.PrepareInput(valid.version(), valid.notes(), List.of(
            new DesktopReleaseService.FileInput("PuppyRuby.exe", 1L, "not-base64"), valid.files().getLast()));
        for (var invalid : List.of(
            new DesktopReleaseService.PrepareInput("0.10.3", valid.notes(), valid.files()),
            new DesktopReleaseService.PrepareInput("0.10.65536.0", valid.notes(), valid.files()),
            new DesktopReleaseService.PrepareInput(valid.version(), "<script>", valid.files()),
            new DesktopReleaseService.PrepareInput(valid.version(), "줄\n바꿈", valid.files()),
            new DesktopReleaseService.PrepareInput(valid.version(), "가".repeat(501), valid.files()), wrongName, duplicate, badHash)) {
            assertStatus(400, () -> service.prepare("admin-token", invalid));
        }
        assertTrue(storage.presigned.isEmpty());
        assertEquals(0, storage.pointerReads);
    }

    @Test
    void notesUseTheSameUtf16LengthBoundaryAsTheBrowserAndExistingPublisher() throws Exception {
        String accepted = "가".repeat(498) + "😀";
        String rejected = "가".repeat(499) + "😀";
        assertEquals(500, accepted.length()); assertEquals(501, rejected.length());
        var input = input("0.10.3.0", accepted, executable, installer);
        var prepared = service.prepare("admin-token", input);
        assertStatus(400, () -> service.prepare("admin-token", input("0.10.3.0", rejected, executable, installer)));
        var valid = manifest(input, prepared.release(), "2026-09-21T00:00:00Z");
        storage.pointer = new ObjectMapper().writeValueAsBytes(valid); storage.eTag = "valid";
        assertEquals(accepted, service.current("admin-token").current().notes());
        var invalid = new DesktopReleaseService.Manifest(1, valid.version(), valid.release(), valid.publishedAt(), rejected, valid.installer());
        storage.pointer = new ObjectMapper().writeValueAsBytes(invalid);
        assertStatus(503, () -> service.current("admin-token"));
    }

    @Test
    void currentVersionCannotDowngradeOrReuseTheVersionForDifferentBinariesOrNotes() {
        executable = pe("1.2.3.4", (byte) 3); installer = pe("1.2.3.4", (byte) 4);
        var first = input("1.2.3.4", "첫 릴리스", executable, installer);
        var prepared = service.prepare("admin-token", first);
        storage.upload("PuppyRuby.exe", executable); storage.upload("PuppyRuby-Setup.exe", installer);
        service.complete("admin-token", complete(first, prepared.release()));

        assertStatus(409, () -> service.prepare("admin-token", input("1.2.3.3", "이전", executable, installer)));
        assertStatus(409, () -> service.prepare("admin-token", input("1.2.3.4", "설명만 변경", executable, installer)));
        byte[] changed = pe("1.2.3.5", (byte) 9);
        assertStatus(409, () -> service.prepare("admin-token", input("1.2.3.4", "첫 릴리스", changed, installer)));
        assertDoesNotThrow(() -> service.prepare("admin-token", input("1.2.3.5", "다음", changed, installer)));
    }

    @Test
    void disabledConfigStillRequiresAdminAndDoesNotInitializeStorage() {
        var disabled = new DesktopReleaseService(new DesktopReleaseSettings(false, "", 300), storage, cdn, auth, audits, new ObjectMapper());
        assertFalse(disabled.current("admin-token").enabled());
        assertNull(disabled.current("admin-token").current());
        assertStatus(503, () -> disabled.prepare("admin-token", input("0.10.3.0", "", executable, installer)));
        assertEquals(0, storage.pointerReads);
        verify(auth, times(3)).requireAdmin("admin-token");
    }

    @Test
    void pointerCompareAndSwapTreatsSameReleaseAsIdempotentAndDifferentReleaseAsConflict() throws Exception {
        var input = input("0.10.3.0", "동시 게시", executable, installer);
        var prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", executable); storage.upload("PuppyRuby-Setup.exe", installer);
        var same = manifest(input, prepared.release(), "2026-09-21T00:00:00Z");
        storage.racePointer = (new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(same) + "\n").getBytes(StandardCharsets.UTF_8);
        var result = service.complete("admin-token", complete(input, prepared.release()));
        assertEquals(same, result);
        var audit = ArgumentCaptor.forClass(AdminAudit.class); verify(audits).save(audit.capture());
        assertEquals("DESKTOP_RELEASE_VERIFY", audit.getValue().action);

        storage = new MemoryStore(); cdn = new MemoryCdn(storage);
        service = new DesktopReleaseService(settings, storage, cdn, auth, audits, new ObjectMapper());
        prepared = service.prepare("admin-token", input);
        storage.upload("PuppyRuby.exe", executable); storage.upload("PuppyRuby-Setup.exe", installer);
        var other = manifest(new DesktopReleaseService.PrepareInput("0.10.4.0", "다른 게시", input.files()),
            "ffffffffffffffff", "2026-09-21T00:00:01Z");
        storage.racePointer = (new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(other) + "\n").getBytes(StandardCharsets.UTF_8);
        String expectedRelease = prepared.release();
        assertStatus(409, () -> service.complete("admin-token", complete(input, expectedRelease)));
        assertEquals(other.release(), service.current("admin-token").current().release());
        verify(audits, times(1)).save(any());
    }

    DesktopReleaseService.Manifest manifest(DesktopReleaseService.PrepareInput input, String release, String publishedAt) {
        var setup = input.files().stream().filter(file -> file.name().equals("PuppyRuby-Setup.exe")).findFirst().orElseThrow();
        String hex = java.util.HexFormat.of().formatHex(Base64.getDecoder().decode(setup.sha256()));
        return new DesktopReleaseService.Manifest(1, input.version(), release, publishedAt, input.notes(),
            new DesktopReleaseService.Installer(settings.downloadUrl(release, "PuppyRuby-Setup.exe"), hex, setup.size()));
    }

    static void assertStatus(int status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
    }
    static byte[] pe(String version, byte fill) {
        byte[] bytes = new byte[2048];
        ByteBuffer value = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        bytes[0] = 'M'; bytes[1] = 'Z'; value.putInt(60, 0x80);
        bytes[0x80] = 'P'; bytes[0x81] = 'E';
        value.putShort(0x86, (short) 1); value.putShort(0x94, (short) 0xf0);
        int optional = 0x98;
        value.putShort(optional, (short) 0x20b); value.putInt(optional + 108, 16);
        value.putInt(optional + 128, 0x1000); value.putInt(optional + 132, 0x200);
        int section = optional + 0xf0;
        value.putInt(section + 8, 0x200); value.putInt(section + 12, 0x1000);
        value.putInt(section + 16, 0x200); value.putInt(section + 20, 0x400);
        int root = 0x400;
        value.putShort(root + 14, (short) 1);
        value.putInt(root + 16, 16); value.putInt(root + 20, 0x80000020);
        value.putShort(root + 0x20 + 14, (short) 1);
        value.putInt(root + 0x30, 1); value.putInt(root + 0x34, 0x80000040);
        value.putShort(root + 0x40 + 14, (short) 1);
        value.putInt(root + 0x50, 1033); value.putInt(root + 0x54, 0x60);
        int versionData = root + 0x80;
        value.putInt(root + 0x60, 0x1080); value.putInt(root + 0x64, 92);
        value.putShort(versionData, (short) 92); value.putShort(versionData + 2, (short) 52);
        value.putShort(versionData + 4, (short) 0);
        byte[] key = "VS_VERSION_INFO\0".getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
        System.arraycopy(key, 0, bytes, versionData + 6, key.length);
        int fixed = versionData + 40;
        int[] parts = Arrays.stream(version.split("\\.")).mapToInt(Integer::parseInt).toArray();
        value.putInt(fixed, 0xFEEF04BD); value.putInt(fixed + 4, 0x00010000);
        value.putInt(fixed + 8, parts[0] << 16 | parts[1]); value.putInt(fixed + 12, parts[2] << 16 | parts[3]);
        bytes[bytes.length - 1] = fill;
        return bytes;
    }
    static String checksum(byte[] value) { return Base64.getEncoder().encodeToString(digest(value)); }
    static String base64(String hex) { return Base64.getEncoder().encodeToString(java.util.HexFormat.of().parseHex(hex)); }
    static String hex(byte[] value) { return java.util.HexFormat.of().formatHex(digest(value)); }
    static byte[] digest(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception impossible) { throw new AssertionError(impossible); }
    }

    static final class MemoryStore implements DesktopReleaseObjectStore {
        static final class Stored { byte[] body; UploadObject upload; Stored(byte[] body, UploadObject upload) { this.body = body; this.upload = upload; } }
        final Map<String, UploadObject> presigned = new LinkedHashMap<>();
        final Map<String, Stored> objects = new HashMap<>();
        byte[] pointer; String eTag; Map<String, String> pointerMetadata; int pointerReads;
        byte[] racePointer;

        @Override public SignedUpload presign(UploadObject upload, int ttlSeconds) {
            presigned.put(upload.name(), upload);
            return new SignedUpload("https://signed.example.test/" + upload.name(), presignHeaders(upload));
        }
        Map<String, String> presignHeaders(UploadObject upload) {
            return Map.of("content-type", upload.contentType(), "content-disposition", upload.contentDisposition(),
                "cache-control", upload.cacheControl(), "x-amz-checksum-sha256", upload.checksumBase64(),
                "x-amz-meta-sha256", upload.sha256Hex(), "if-none-match", "*");
        }
        void upload(String name, byte[] body) {
            UploadObject expected = presigned.get(name);
            objects.put(expected.key(), new Stored(body.clone(), expected));
        }
        @Override public Head head(String key) {
            Stored value = objects.get(key);
            if (value == null) return null;
            UploadObject upload = value.upload;
            return new Head(value.body.length, upload.checksumBase64(), upload.contentType(), upload.contentDisposition(),
                upload.cacheControl(), Map.of("sha256", upload.sha256Hex()));
        }
        @Override public byte[] readRange(String key, long first, long last) {
            return Arrays.copyOfRange(objects.get(key).body, Math.toIntExact(first), Math.toIntExact(last + 1));
        }
        @Override public void createText(UploadObject upload, byte[] body) {
            if (objects.putIfAbsent(upload.key(), new Stored(body.clone(), upload)) != null) throw new PreconditionFailed();
        }
        @Override public Pointer readPointer() { pointerReads++; return pointer == null ? null : new Pointer(pointer.clone(), eTag); }
        @Override public void replacePointer(byte[] body, String expectedETag, Map<String, String> metadata) {
            if (!java.util.Objects.equals(expectedETag, eTag)) throw new PreconditionFailed();
            if (racePointer != null) {
                pointer = racePointer; racePointer = null; eTag = "racing-etag"; throw new PreconditionFailed();
            }
            pointer = body.clone(); pointerMetadata = Map.copyOf(metadata); eTag = "etag-" + body.length;
        }
    }

    static final class MemoryCdn implements DesktopReleaseCdnVerifier {
        final MemoryStore storage; int calls; RuntimeException failure;
        MemoryCdn(MemoryStore storage) { this.storage = storage; }
        @Override public void verify(List<Asset> assets) {
            calls++;
            if (failure != null) throw failure;
            if (assets.size() != 4) throw new AssertionError("four CDN assets required");
            for (Asset asset : assets) {
                String key = asset.url().substring("https://cdn.puppyruby.com/".length());
                MemoryStore.Stored value = storage.objects.get("puppyruby/" + key);
                if (value == null || value.body.length != asset.size() || !hex(value.body).equals(asset.sha256Hex()))
                    throw new AssertionError("CDN fixture mismatch: " + asset.name());
            }
        }
    }
}
