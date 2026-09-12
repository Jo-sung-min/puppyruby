package com.puppyruby.media;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

@Service
public class MediaService {
    private final MediaSettings settings;
    private final MediaUploadRepository uploads;
    private final MediaObjectStore storage;
    private final MediaRateLimiter limiter;

    public MediaService(MediaSettings settings, MediaUploadRepository uploads, MediaObjectStore storage, MediaRateLimiter limiter) {
        this.settings = settings; this.uploads = uploads; this.storage = storage; this.limiter = limiter;
    }
    public record Config(boolean enabled, int maxBytes, List<String> acceptedTypes) {}
    public record Input(String contentType, Long size, String sha256) {}
    public record Presigned(String uploadId, String uploadUrl, String method, Map<String, String> headers, long expiresAt) {}
    public record Complete(String uploadId) {}
    public record Completed(String photo, String url) {}

    public Config config() { return new Config(settings.enabled, settings.maxBytes, MediaSettings.TYPES); }

    @Transactional
    public Presigned presign(String ownerPlayerId, Input input) {
        requireEnabled(); limiter.take("presign", ownerPlayerId, 10);
        if (input == null || !MediaSettings.TYPES.contains(Objects.toString(input.contentType(), ""))
            || input.size() == null || input.size() <= 0 || input.size() > settings.maxBytes)
            throw bad("사진 종류와 크기를 확인해 주세요. JPG·PNG 사진만 등록할 수 있어요.");
        if (!validChecksum(input.sha256())) throw bad("사진 확인 정보가 올바르지 않아요. 파일을 다시 선택해 주세요.");
        long now = System.currentTimeMillis();
        var upload = new MediaUpload(); upload.id = UUID.randomUUID().toString(); upload.ownerPlayerId = ownerPlayerId;
        upload.bucket = settings.bucket;
        upload.objectKey = settings.prefix + "/walk-profiles/" + UUID.randomUUID() + (input.contentType().equals("image/png") ? ".png" : ".jpg");
        upload.contentType = input.contentType(); upload.sha256 = input.sha256(); upload.size = input.size();
        upload.createdAt = now; upload.expiresAt = now + settings.ttlSeconds * 1000L;
        var signed = storage.presign(upload, settings.ttlSeconds);
        uploads.save(upload);
        return new Presigned(upload.id, signed.url(), "PUT", signed.headers(), upload.expiresAt);
    }

    @Transactional
    public Completed complete(String ownerPlayerId, Complete input) {
        limiter.take("complete", ownerPlayerId, 20);
        String id = canonicalId(input == null ? null : input.uploadId());
        MediaUpload upload = uploads.findLocked(id).filter(value -> value.ownerPlayerId.equals(ownerPlayerId))
            .orElseThrow(() -> bad("내가 올린 사진을 다시 선택해 주세요."));
        if (upload.completedAt != null) return completed(upload);
        requireEnabled();
        if (upload.expiresAt <= System.currentTimeMillis()) throw bad("사진 등록 시간이 만료되었어요. 파일을 다시 선택해 주세요.");
        MediaObjectStore.StoredImage object = storage.read(upload, settings.maxBytes);
        if (object.bytes() == null || object.bytes().length != upload.size || object.contentLength() != upload.size
            || object.bytes().length > settings.maxBytes || !upload.contentType.equals(object.contentType())
            || !MessageDigest.isEqual(Base64.getDecoder().decode(upload.sha256), digest(object.bytes()))
            || !validImage(object.bytes(), upload.contentType))
            throw bad("사진을 확인할 수 없어요. 가로·세로 1,024px 이하의 JPG·PNG 사진을 다시 올려 주세요.");
        upload.completedAt = System.currentTimeMillis(); uploads.save(upload);
        return completed(upload);
    }

    /** Only application-issued, completed references can become a profile photo. */
    @Transactional(readOnly = true)
    public String ownedReference(String ownerPlayerId, String reference) {
        if (reference == null || !reference.startsWith("media:")) throw bad("등록한 사진을 다시 선택해 주세요.");
        String id = canonicalId(reference.substring(6));
        uploads.findById(id).filter(value -> value.ownerPlayerId.equals(ownerPlayerId) && value.completedAt != null)
            .orElseThrow(() -> bad("내가 등록을 완료한 사진만 사용할 수 있어요."));
        return "media:" + id;
    }

    /** Call only after the walk service has checked self/friend visibility. */
    @Transactional(readOnly = true)
    public String resolve(String reference) {
        if (reference == null || !reference.startsWith("media:")) return reference;
        String id = reference.substring(6);
        return uploads.findById(id).filter(value -> value.completedAt != null)
            .map(value -> settings.imageUrl(value.objectKey)).orElse(null);
    }

    private Completed completed(MediaUpload upload) { return new Completed("media:" + upload.id, settings.imageUrl(upload.objectKey)); }
    private void requireEnabled() {
        if (!settings.enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "사진 업로드를 준비 중이에요. 잠시 후 다시 이용해 주세요.");
    }
    private static String canonicalId(String value) {
        try { String id = UUID.fromString(value).toString(); if (!id.equals(value)) throw new IllegalArgumentException(); return id; }
        catch (RuntimeException error) { throw bad("사진 등록 정보를 확인해 주세요."); }
    }
    private static boolean validChecksum(String checksum) {
        try { return checksum != null && checksum.matches("[A-Za-z0-9+/]{43}=") && Base64.getDecoder().decode(checksum).length == 32
            && Base64.getEncoder().encodeToString(Base64.getDecoder().decode(checksum)).equals(checksum); }
        catch (IllegalArgumentException error) { return false; }
    }
    private static byte[] digest(byte[] bytes) {
        try { return MessageDigest.getInstance("SHA-256").digest(bytes); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    static boolean validImage(byte[] bytes, String contentType) {
        boolean png = bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8), new byte[] {(byte)137, 80, 78, 71, 13, 10, 26, 10});
        boolean jpeg = bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        if (!(contentType.equals("image/png") && png || contentType.equals("image/jpeg") && jpeg)) return false;
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) return false;
            var reader = readers.next();
            try {
                reader.setInput(stream);
                if (reader.getWidth(0) < 1 || reader.getHeight(0) < 1 || reader.getWidth(0) > 1024 || reader.getHeight(0) > 1024) return false;
                return reader.read(0) != null;
            } finally { reader.dispose(); }
        } catch (Exception invalid) { return false; }
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
