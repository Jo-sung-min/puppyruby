import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;

/** Offline tests for download scope, streamed integrity and executable/archive validation. */
public final class SiteDownloadPublisherTest {
    private static int checks;
    @FunctionalInterface interface Checked { void run() throws Exception; }
    private static void check(boolean condition) { if (!condition) throw new AssertionError(); checks++; }
    private static void rejected(Checked action) throws Exception {
        try { action.run(); } catch (RuntimeException expected) { checks++; return; }
        throw new AssertionError("Invalid download was accepted");
    }
    public static void main(String[] args) throws Exception {
        var allowed = SiteDownloadPublisher.ALLOWED_PATHS;
        SiteDownloadPublisher.validateInventory(allowed); check(allowed.size() == 188);
        check(allowed.stream().filter(path -> path.endsWith(".aseprite")).count() == 175);
        check(allowed.stream().filter(path -> path.endsWith(".zip")).count() == 9);
        check(allowed.stream().filter(path -> path.endsWith(".exe")).count() == 2);
        check(allowed.stream().noneMatch(path -> path.endsWith(".jar")));
        check(allowed.stream().filter(path -> path.endsWith(".sha256")).count() == 2);
        check(SiteDownloadPublisher.EXCLUDED_SERVER_PATHS.size() == 3);
        for (String server : SiteDownloadPublisher.EXCLUDED_SERVER_PATHS) {
            check(!allowed.contains(server));
            var withServer = new HashSet<>(allowed); withServer.add(server);
            rejected(() -> SiteDownloadPublisher.validateInventory(withServer));
        }
        for (String path : allowed) {
            var missing = new HashSet<>(allowed); missing.remove(path);
            rejected(() -> SiteDownloadPublisher.validateInventory(missing));
        }
        for (String path : List.of("downloads/.env", "downloads/private.png", "downloads/app.db", "downloads/log.txt", "downloads/test.exe", "../work/archive.zip")) {
            var extra = new HashSet<>(allowed); extra.add(path);
            rejected(() -> SiteDownloadPublisher.validateInventory(extra));
        }
        String key = "puppyruby/site-downloads/123456789abcdef0";
        check(SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com/", key, "puppyruby").equals("https://cdn.puppyruby.com/site-downloads/123456789abcdef0"));
        check(SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com", key, "").equals("https://cdn.puppyruby.com/" + key));
        for (String origin : List.of("puppy", "puppyruby/site-down", "../puppyruby")) rejected(() -> SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com", key, origin));
        for (String cdn : List.of("http://cdn.puppyruby.com", "https://user:secret@cdn.puppyruby.com", "https://cdn.puppyruby.com?secret=x", "https://cdn.puppyruby.com/#x")) rejected(() -> SiteDownloadPublisher.cdnBase(cdn, key, "puppyruby"));
        for (String bad : List.of("../secret.txt", "/etc/passwd", "C:/file.txt", "dir\\file.txt", "archive/.env", "archive/.env.local", "config/credentials", "logs/app.sqlite", "secrets/key.pem", "private/id_rsa", "capture.exe"))
            rejected(() -> SiteDownloadPublisher.validateArchiveEntry(bad, 42));
        SiteDownloadPublisher.validateArchiveEntry("sp08/pomeranian/idle.png", 42); check(true);
        SiteDownloadPublisher.validateArchiveEntry("index.html", 42); check(true);
        rejected(() -> SiteDownloadPublisher.validateArchiveEntry("private.html", 42));
        rejected(() -> SiteDownloadPublisher.validateArchiveEntry("PuppyRuby-server.jar", 42));
        rejected(() -> SiteDownloadPublisher.validateArchiveEntry("BOOT-INF/lib/spring.jar", 42));
        rejected(() -> SiteDownloadPublisher.validateArchiveEntry("art.png", -1));
        rejected(() -> SiteDownloadPublisher.validateArchiveEntry("art.png", SiteDownloadPublisher.MAX_FILE_BYTES + 1));

        byte[] body = new byte[3 * 1024 * 1024 + 7]; new Random(31).nextBytes(body);
        var digest = SiteDownloadPublisher.digest(new ByteArrayInputStream(body), body.length);
        check(digest.bytes() == body.length);
        check(digest.hex().equals(HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(body))));
        rejected(() -> SiteDownloadPublisher.digest(new ByteArrayInputStream(body), body.length - 1));
        var asset = new SiteDownloadPublisher.Asset(Path.of("PuppyRuby.exe"), "downloads/PuppyRuby.exe", "application/vnd.microsoft.portable-executable", "attachment; filename=\"PuppyRuby.exe\"", body.length, digest.hex(), digest.base64());
        var head = HeadObjectResponse.builder().contentLength(asset.size()).contentType(asset.contentType()).contentDisposition(asset.disposition()).cacheControl(SiteDownloadPublisher.CACHE)
            .checksumSHA256(asset.checksum()).metadata(Map.of("sha256", asset.sha256())).build();
        SiteDownloadPublisher.verifyHead(head, asset); check(true);
        rejected(() -> SiteDownloadPublisher.verifyHead(head.toBuilder().contentLength(1L).build(), asset));
        rejected(() -> SiteDownloadPublisher.verifyHead(head.toBuilder().checksumSHA256("wrong").build(), asset));
        rejected(() -> SiteDownloadPublisher.verifyHead(head.toBuilder().metadata(Map.of()).build(), asset));
        rejected(() -> SiteDownloadPublisher.verifyHead(head.toBuilder().cacheControl("no-cache").build(), asset));
        rejected(() -> SiteDownloadPublisher.verifyHead(head.toBuilder().contentDisposition("inline").build(), asset));
        SiteDownloadPublisher.validateSidecar(asset.sha256() + "  PuppyRuby.exe\n", asset); check(true);
        rejected(() -> SiteDownloadPublisher.validateSidecar(asset.sha256() + "  other.exe", asset));
        rejected(() -> SiteDownloadPublisher.validateSidecar("0".repeat(64) + "  PuppyRuby.exe", asset));

        Path temporary = Files.createTempDirectory("puppyruby-download-publisher-test-");
        try {
            byte[] aseprite = new byte[128];
            ByteBuffer header = ByteBuffer.wrap(aseprite).order(ByteOrder.LITTLE_ENDIAN);
            header.putInt(0, 128); header.putShort(4, (short) 0xa5e0); header.putShort(6, (short) 16); header.putShort(8, (short) 320); header.putShort(10, (short) 320); header.putShort(12, (short) 32);
            Path nativeFile = temporary.resolve("pomeranian.aseprite"); Files.write(nativeFile, aseprite);
            check(SiteDownloadPublisher.validateFile(nativeFile, "downloads/pomeranian.aseprite", 128).equals("application/octet-stream"));
            rejected(() -> SiteDownloadPublisher.validateFile(nativeFile, "downloads/pomeranian.aseprite", 129));
            header.putShort(4, (short) 0); Files.write(nativeFile, aseprite);
            rejected(() -> SiteDownloadPublisher.validateFile(nativeFile, "downloads/pomeranian.aseprite", 128));
            Path executable = temporary.resolve("PuppyRuby.exe"); byte[] exe = new byte[256];
            exe[0] = 'M'; exe[1] = 'Z'; ByteBuffer.wrap(exe).order(ByteOrder.LITTLE_ENDIAN).putInt(60, 128); exe[128] = 'P'; exe[129] = 'E'; Files.write(executable, exe);
            check(SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256).equals(asset.contentType()));
            exe[129] = 'X'; Files.write(executable, exe);
            rejected(() -> SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256));
            Path zip = temporary.resolve("preview.zip");
            try (var stream = new ZipOutputStream(Files.newOutputStream(zip))) { stream.putNextEntry(new ZipEntry("source/art.png")); stream.write(new byte[]{1, 2, 3}); stream.closeEntry(); }
            check(SiteDownloadPublisher.validateFile(zip, "downloads/preview.zip", Files.size(zip)).equals("application/zip"));
            rejected(() -> SiteDownloadPublisher.validateFile(zip, "downloads/preview.jar", Files.size(zip)));
        } finally {
            try (var files = Files.walk(temporary)) { for (Path path : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(path); }
        }
        if (args.length == 1) {
            var actual = SiteDownloadPublisher.inventory(Path.of(args[0]).resolve("local-assets/site"));
            check(actual.size() == 188);
            check(actual.stream().noneMatch(assetEntry -> SiteDownloadPublisher.EXCLUDED_SERVER_PATHS.contains(assetEntry.path())));
            System.out.println("ACTUAL_DOWNLOAD_BYTES=" + actual.stream().mapToLong(SiteDownloadPublisher.Asset::size).sum());
        }
        System.out.println("PASS: " + checks + " offline download publication checks; exact scope, streaming checksums, metadata, archives, Aseprite and PE headers validated.");
    }
}
