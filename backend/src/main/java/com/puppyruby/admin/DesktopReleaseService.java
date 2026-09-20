package com.puppyruby.admin;

import com.puppyruby.auth.AuthService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class DesktopReleaseService {
    private static final Set<String> BINARY_NAMES = Set.of("PuppyRuby.exe", "PuppyRuby-Setup.exe");

    public record FileInput(String name, Long size, String sha256) {}
    public record PrepareInput(String version, String notes, List<FileInput> files) {}
    public record CompleteInput(String version, String notes, String release, List<FileInput> files) {}
    public record Upload(String name, boolean required, String uploadUrl, String method,
                         Map<String, String> headers, Long expiresAt) {}
    public record Prepared(String release, List<Upload> uploads) {}
    public record Installer(String url, String sha256, long size) {}
    public record Manifest(int schemaVersion, String version, String release, String publishedAt,
                           String notes, Installer installer) {}
    public record Config(boolean enabled, Manifest current) {}

    private record Asset(String name, String path, long size, byte[] digest, String sha256Hex,
                         String checksumBase64, String contentType, String disposition, byte[] body) {
        DesktopReleaseObjectStore.UploadObject upload(DesktopReleaseSettings settings, String release) {
            return new DesktopReleaseObjectStore.UploadObject(settings.binaryKey(release, name), name, size,
                checksumBase64, sha256Hex, contentType, disposition, DesktopReleaseSettings.IMMUTABLE_CACHE);
        }
    }
    private record Request(String version, int[] versionParts, String notes, String release,
                           List<Asset> binaries, List<Asset> allAssets) {}

    private final DesktopReleaseSettings settings;
    private final DesktopReleaseObjectStore storage;
    private final DesktopReleaseCdnVerifier cdn;
    private final AuthService auth;
    private final AdminAuditRepository audits;
    private final ObjectMapper json;

    @Autowired
    public DesktopReleaseService(DesktopReleaseSettings settings, DesktopReleaseObjectStore storage,
                                 DesktopReleaseCdnVerifier cdn, AuthService auth,
                                 AdminAuditRepository audits, ObjectMapper json) {
        this.settings = settings; this.storage = storage; this.cdn = cdn;
        this.auth = auth; this.audits = audits; this.json = json;
    }

    @Transactional(readOnly = true)
    public Config current(String token) {
        auth.requireAdmin(token);
        return new Config(settings.enabled, settings.enabled ? readCurrent() : null);
    }

    @Transactional(readOnly = true)
    public Prepared prepare(String token, PrepareInput input) {
        auth.requireAdmin(token);
        requireEnabled();
        Request request = parse(input == null ? null : input.version(), input == null ? null : input.notes(),
            input == null ? null : input.files());
        ensurePublishable(request, readCurrent());
        long expiresAt = System.currentTimeMillis() + settings.ttlSeconds * 1000L;
        var uploads = new ArrayList<Upload>();
        for (Asset asset : request.binaries()) {
            var upload = asset.upload(settings, request.release());
            var head = storage.head(upload.key());
            if (head != null) {
                verifyHead(upload, head);
                uploads.add(new Upload(asset.name(), false, null, null, null, null));
                continue;
            }
            var signed = storage.presign(upload, settings.ttlSeconds);
            uploads.add(new Upload(asset.name(), true, signed.url(), "PUT", signed.headers(), expiresAt));
        }
        uploads.sort(Comparator.comparing(Upload::name));
        return new Prepared(request.release(), List.copyOf(uploads));
    }

    @Transactional
    public Manifest complete(String token, CompleteInput input) {
        var actor = auth.requireAdmin(token);
        requireEnabled();
        Request request = parse(input == null ? null : input.version(), input == null ? null : input.notes(),
            input == null ? null : input.files());
        String providedRelease = input == null ? null : input.release();
        if (providedRelease == null || !providedRelease.matches("[a-f0-9]{16}") || !request.release().equals(providedRelease))
            throw bad("릴리스 식별자가 업로드 파일과 맞지 않아요. 다시 준비해 주세요.");

        for (Asset asset : request.binaries()) {
            var upload = asset.upload(settings, request.release());
            verifyHead(upload, storage.head(upload.key()));
            String actualVersion = readPortableExecutableVersion(upload.key(), asset.size());
            if (!request.version().equals(actualVersion))
                throw conflict(asset.name() + "의 실제 파일 버전 " + actualVersion + "이 입력한 버전 " + request.version() + "과 달라요.");
        }
        for (Asset asset : request.allAssets()) {
            if (asset.body() == null) continue;
            ensureSidecar(asset.upload(settings, request.release()), asset.body());
        }
        cdn.verify(request.allAssets().stream().map(asset -> new DesktopReleaseCdnVerifier.Asset(asset.name(),
            settings.downloadUrl(request.release(), asset.name()), asset.size(), asset.sha256Hex(), asset.contentType(),
            asset.disposition(), DesktopReleaseSettings.IMMUTABLE_CACHE)).toList());

        Manifest result;
        boolean existing = false;
        DesktopReleaseObjectStore.Pointer pointer = storage.readPointer();
        // Read and selection use the same pointer snapshot for the conditional replacement.
        Manifest current = pointer == null ? null : parseManifest(pointer.bytes());
        ensurePublishable(request, current);
        if (current != null && current.version().equals(request.version()) && current.release().equals(request.release())) {
            validateManifest(current, request);
            result = current;
            existing = true;
        } else {
            Asset installer = request.binaries().stream().filter(asset -> asset.name().equals("PuppyRuby-Setup.exe")).findFirst().orElseThrow();
            result = new Manifest(1, request.version(), request.release(),
                Instant.now().truncatedTo(ChronoUnit.MILLIS).toString(), request.notes(),
                new Installer(settings.downloadUrl(request.release(), installer.name()), installer.sha256Hex(), installer.size()));
            byte[] bytes = manifestBytes(result);
            try {
                storage.replacePointer(bytes, pointer == null ? null : pointer.eTag(),
                    Map.of("release", request.release(), "version", request.version()));
            } catch (DesktopReleaseObjectStore.PreconditionFailed conflict) {
                Manifest raced = readCurrent();
                if (raced == null || !raced.release().equals(request.release()) || !raced.version().equals(request.version()))
                    throw conflict("다른 관리자가 업데이트 정보를 먼저 변경했어요. 현재 정보를 확인하고 다시 시도해 주세요.");
                validateManifest(raced, request);
                result = raced;
                existing = true;
            }
        }
        String reason = "Windows 릴리스 " + (existing ? "재확인" : "게시") + ": " + result.version()
            + ", 릴리스 " + result.release() + ", 설치 파일 " + result.installer().size() + " bytes";
        audits.save(new AdminAudit(actor.id, "DESKTOP_RELEASE", result.release(),
            existing ? "DESKTOP_RELEASE_VERIFY" : "DESKTOP_RELEASE_PUBLISH", reason));
        return result;
    }

    private void ensureSidecar(DesktopReleaseObjectStore.UploadObject upload, byte[] body) {
        var head = storage.head(upload.key());
        if (head == null) {
            try { storage.createText(upload, body); }
            catch (DesktopReleaseObjectStore.PreconditionFailed raced) { /* Verify the winner below. */ }
            head = storage.head(upload.key());
        }
        verifyHead(upload, head);
    }

    private String readPortableExecutableVersion(String key, long size) {
        try { return DesktopPeFileVersion.read(size, (first, last) -> storage.readRange(key, first, last)); }
        catch (IllegalArgumentException error) { throw conflict("업로드한 Windows 실행 파일의 버전 정보를 확인할 수 없어요."); }
    }

    private void verifyHead(DesktopReleaseObjectStore.UploadObject expected, DesktopReleaseObjectStore.Head actual) {
        if (actual == null) throw conflict("아직 모든 설치 파일이 S3에 업로드되지 않았어요.");
        if (actual.size() != expected.size() || !expected.checksumBase64().equals(actual.checksumBase64())
            || !expected.contentType().equals(actual.contentType()) || !expected.contentDisposition().equals(actual.contentDisposition())
            || !expected.cacheControl().equals(actual.cacheControl()) || actual.metadata() == null
            || !expected.sha256Hex().equals(actual.metadata().get("sha256")))
            throw conflict("S3 파일의 크기, 체크섬 또는 다운로드 설정이 준비 단계와 달라요.");
    }

    private Request parse(String version, String notes, List<FileInput> files) {
        String cleanVersion = Objects.toString(version, "");
        int[] parts = versionParts(cleanVersion);
        String cleanNotes = Objects.toString(notes, "");
        if (cleanNotes.length() > 500 || cleanNotes.indexOf('<') >= 0 || cleanNotes.indexOf('>') >= 0
            || cleanNotes.codePoints().anyMatch(Character::isISOControl))
            throw bad("업데이트 설명은 제어문자와 <, > 없이 500자 이내로 입력해 주세요.");
        if (files == null || files.size() != 2) throw bad("두 Windows 설치 파일 정보를 모두 입력해 주세요.");
        var names = new HashMap<String, Asset>();
        for (FileInput file : files) {
            if (file == null || !BINARY_NAMES.contains(file.name()) || names.containsKey(file.name())
                || file.size() == null || file.size() < 1 || file.size() > DesktopReleaseSettings.MAX_FILE_BYTES)
                throw bad("PuppyRuby.exe와 PuppyRuby-Setup.exe의 이름과 크기를 확인해 주세요.");
            byte[] digest;
            try { digest = Base64.getDecoder().decode(Objects.toString(file.sha256(), "")); }
            catch (IllegalArgumentException error) { throw bad("SHA-256 체크섬은 base64 형식이어야 해요."); }
            String canonical = Base64.getEncoder().encodeToString(digest);
            if (digest.length != 32 || !canonical.equals(file.sha256()))
                throw bad("SHA-256 체크섬은 32바이트의 표준 base64 형식이어야 해요.");
            String hex = HexFormat.of().formatHex(digest);
            String path = "downloads/" + file.name();
            names.put(file.name(), new Asset(file.name(), path, file.size(), digest, hex, canonical,
                DesktopReleaseSettings.EXECUTABLE_TYPE, disposition(file.name()), null));
        }
        if (!names.keySet().equals(BINARY_NAMES)) throw bad("두 Windows 설치 파일 정보를 모두 입력해 주세요.");
        var binaries = names.values().stream().sorted(Comparator.comparing(Asset::name)).toList();
        var all = new ArrayList<>(binaries);
        for (Asset binary : binaries) all.add(sidecar(binary));
        all.sort(Comparator.comparing(Asset::path));
        String release = release(all);
        return new Request(cleanVersion, parts, cleanNotes, release, binaries, List.copyOf(all));
    }

    private static Asset sidecar(Asset binary) {
        String sidecarName = binary.name().replace(".exe", ".sha256");
        // Match the Windows build publisher byte-for-byte so both paths derive the same 16-hex release id.
        byte[] body = (binary.sha256Hex().toUpperCase(java.util.Locale.ROOT) + "  " + binary.name() + "\r\n")
            .getBytes(StandardCharsets.UTF_8);
        byte[] digest = digest(body);
        return new Asset(sidecarName, "downloads/" + sidecarName, body.length, digest,
            HexFormat.of().formatHex(digest), Base64.getEncoder().encodeToString(digest),
            "text/plain", disposition(sidecarName), body);
    }

    private static String release(List<Asset> assets) {
        StringBuilder canonical = new StringBuilder();
        for (Asset asset : assets) canonical.append(asset.path()).append('\t').append(asset.contentType()).append('\t')
            .append(asset.disposition()).append('\t').append(DesktopReleaseSettings.IMMUTABLE_CACHE).append('\t')
            .append(asset.size()).append('\t').append(asset.sha256Hex()).append('\n');
        return HexFormat.of().formatHex(digest(canonical.toString().getBytes(StandardCharsets.UTF_8))).substring(0, 16);
    }

    private static byte[] digest(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String disposition(String name) { return "attachment; filename=\"" + name + "\""; }

    private static int[] versionParts(String version) {
        if (version == null || !version.matches("(?:0|[1-9][0-9]{0,4})(?:\\.(?:0|[1-9][0-9]{0,4})){3}"))
            throw bad("버전은 0.10.2.0 같은 네 자리 Windows 버전으로 입력해 주세요.");
        int[] parts = Arrays.stream(version.split("\\.")).mapToInt(Integer::parseInt).toArray();
        if (Arrays.stream(parts).anyMatch(value -> value > 65535))
            throw bad("Windows 버전의 각 숫자는 65535 이하여야 해요.");
        return parts;
    }

    private void ensurePublishable(Request request, Manifest current) {
        if (current == null) return;
        int comparison = Arrays.compare(request.versionParts(), versionParts(current.version()));
        if (comparison < 0 || comparison == 0 && !request.release().equals(current.release()))
            throw conflict("현재 버전보다 낮거나 같은 버전의 다른 릴리스는 게시할 수 없어요. 버전을 올려 주세요.");
        if (comparison == 0) validateManifest(current, request);
    }

    private void validateManifest(Manifest manifest, Request request) {
        Asset installer = request.binaries().stream().filter(asset -> asset.name().equals("PuppyRuby-Setup.exe")).findFirst().orElseThrow();
        if (manifest.schemaVersion() != 1 || !request.version().equals(manifest.version())
            || !request.release().equals(manifest.release()) || !request.notes().equals(manifest.notes())
            || manifest.installer() == null
            || !settings.downloadUrl(request.release(), installer.name()).equals(manifest.installer().url())
            || !installer.sha256Hex().equals(manifest.installer().sha256()) || installer.size() != manifest.installer().size())
            throw conflict("같은 버전의 게시된 업데이트 정보가 현재 파일 정보와 달라요. 버전을 올려 주세요.");
    }

    private Manifest readCurrent() {
        DesktopReleaseObjectStore.Pointer pointer = storage.readPointer();
        return pointer == null ? null : parseManifest(pointer.bytes());
    }

    private Manifest parseManifest(byte[] bytes) {
        try {
            Manifest manifest = json.readValue(bytes, Manifest.class);
            if (manifest == null || manifest.schemaVersion() != 1 || !manifest.release().matches("[a-f0-9]{16}")) throw new IllegalArgumentException();
            versionParts(manifest.version());
            if (manifest.publishedAt() == null) throw new IllegalArgumentException();
            Instant.parse(manifest.publishedAt());
            if (manifest.notes() == null) throw new IllegalArgumentException();
            String notes = manifest.notes();
            if (notes.length() > 500 || notes.indexOf('<') >= 0 || notes.indexOf('>') >= 0
                || notes.codePoints().anyMatch(Character::isISOControl) || manifest.installer() == null
                || !settings.downloadUrl(manifest.release(), "PuppyRuby-Setup.exe").equals(manifest.installer().url())
                || manifest.installer().sha256() == null || !manifest.installer().sha256().matches("[a-f0-9]{64}")
                || manifest.installer().size() < 1 || manifest.installer().size() > DesktopReleaseSettings.MAX_FILE_BYTES)
                throw new IllegalArgumentException();
            return manifest;
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "게시된 Windows 업데이트 정보가 올바르지 않아요.");
        }
    }

    private byte[] manifestBytes(Manifest manifest) {
        try { return (json.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n").getBytes(StandardCharsets.UTF_8); }
        catch (RuntimeException error) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "업데이트 정보를 만들 수 없어요."); }
    }

    private void requireEnabled() {
        if (!settings.enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "S3 Windows 릴리스 업로드가 설정되지 않았어요.");
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
