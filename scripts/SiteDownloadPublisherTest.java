import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;

/** Offline guards for the desktop-only public download release. */
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
        SiteDownloadPublisher.validateInventory(allowed); check(allowed.size() == 4);
        check(allowed.stream().filter(path -> path.endsWith(".exe")).count() == 2);
        check(allowed.stream().filter(path -> path.endsWith(".sha256")).count() == 2);
        check(allowed.stream().noneMatch(path -> path.endsWith(".jar") || path.endsWith(".zip") || path.endsWith(".aseprite")));
        for (String path : allowed) {
            var missing = new HashSet<>(allowed); missing.remove(path);
            rejected(() -> SiteDownloadPublisher.validateInventory(missing));
        }
        for (String path : List.of("downloads/PuppyRuby-server.jar", "downloads/puppyruby-pixel-art-30.zip",
                "downloads/art16-scenes-v1/pomeranian.aseprite", "downloads/.env", "../work/archive.zip")) {
            var extra = new HashSet<>(allowed); extra.add(path);
            rejected(() -> SiteDownloadPublisher.validateInventory(extra));
        }

        String key = "puppyruby/site-downloads/123456789abcdef0";
        check(SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com/", key, "puppyruby").equals("https://cdn.puppyruby.com/site-downloads/123456789abcdef0"));
        check(SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com", key, "").equals("https://cdn.puppyruby.com/" + key));
        for (String origin : List.of("puppy", "puppyruby/site-down", "../puppyruby")) rejected(() -> SiteDownloadPublisher.cdnBase("https://cdn.puppyruby.com", key, origin));
        for (String cdn : List.of("http://cdn.puppyruby.com", "https://user:secret@cdn.puppyruby.com", "https://cdn.puppyruby.com?secret=x", "https://cdn.puppyruby.com/#x"))
            rejected(() -> SiteDownloadPublisher.cdnBase(cdn, key, "puppyruby"));

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
            Path executable = temporary.resolve("PuppyRuby.exe"); byte[] exe = new byte[256];
            exe[0] = 'M'; exe[1] = 'Z'; ByteBuffer.wrap(exe).order(ByteOrder.LITTLE_ENDIAN).putInt(60, 128); exe[128] = 'P'; exe[129] = 'E'; Files.write(executable, exe);
            check(SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256).equals(asset.contentType()));
            exe[129] = 'X'; Files.write(executable, exe);
            rejected(() -> SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256));
        } finally {
            try (var files = Files.walk(temporary)) { for (Path path : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(path); }
        }
        if (args.length == 1) {
            var actual = SiteDownloadPublisher.inventory(Path.of(args[0]).resolve("local-assets/site"));
            check(actual.size() == 4);
            check(actual.stream().map(SiteDownloadPublisher.Asset::path).collect(java.util.stream.Collectors.toSet()).equals(allowed));
            System.out.println("ACTUAL_DOWNLOAD_BYTES=" + actual.stream().mapToLong(SiteDownloadPublisher.Asset::size).sum());
        }
        System.out.println("PASS: " + checks + " offline download publication checks; exact 4-file desktop inventory excludes art packs and server files.");
    }
}
