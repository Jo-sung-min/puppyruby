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

        Path testRoot = args.length == 1 ? Path.of(args[0]).resolve("local-assets/work") : Path.of(System.getProperty("java.io.tmpdir"));
        Files.createDirectories(testRoot);
        Path temporary = Files.createTempDirectory(testRoot, "puppyruby-download-publisher-test-").toRealPath();
        try {
            Path executable = temporary.resolve("PuppyRuby.exe"); byte[] exe = new byte[256];
            exe[0] = 'M'; exe[1] = 'Z'; ByteBuffer.wrap(exe).order(ByteOrder.LITTLE_ENDIAN).putInt(60, 128); exe[128] = 'P'; exe[129] = 'E'; Files.write(executable, exe);
            check(SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256).equals(asset.contentType()));
            exe[129] = 'X'; Files.write(executable, exe);
            rejected(() -> SiteDownloadPublisher.validateFile(executable, "downloads/PuppyRuby.exe", 256));
            testUpdateRegistration(temporary);
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

    static void testUpdateRegistration(Path project) throws Exception {
        for (String version : List.of("0.10.0.0", "65535.65535.65535.65535")) { SiteDownloadPublisher.validateVersion(version); check(true); }
        for (String version : List.of("0.10", "1.0.0.0-alpha", "00.10.0.0", "1.65536.0.0")) rejected(() -> SiteDownloadPublisher.validateVersion(version));
        Path generated = project.resolve("frontend/src/lib/generated"), staged = project.resolve("local-assets/site/downloads");
        Files.createDirectories(generated); Files.createDirectories(staged); Files.createDirectories(project.resolve("desktop"));
        String oldMedia = "{\"images\":{\"release\":\"keep-images\",\"baseUrl\":\"https://cdn.puppyruby.com/images\"},\"downloads\":{\"release\":\"old\",\"baseUrl\":\"old\"}}";
        Path media = generated.resolve("public-media-release.json"), latest = generated.resolve("desktop-update-release.json"), buildFile = staged.resolve("desktop-build.json");
        Files.writeString(media, oldMedia); Files.writeString(latest, "null\n");
        var assets = new ArrayList<SiteDownloadPublisher.Asset>();
        for (String path : SiteDownloadPublisher.ALLOWED_PATHS) assets.add(new SiteDownloadPublisher.Asset(project.resolve(path), path, "type", "attachment", 256, "a".repeat(64), "checksum"));
        var definition = SiteDownloadPublisher.JSON.createObjectNode().put("version", "0.10.0.0").put("notes", "새 동작과 업데이트 알림");
        Files.writeString(project.resolve("desktop/version.json"), definition.toString());
        var metadata = definition.deepCopy().put("schemaVersion", 1);
        var files = metadata.putArray("files");
        for (String path : List.of("downloads/PuppyRuby.exe", "downloads/PuppyRuby-Setup.exe"))
            files.addObject().put("path", path).put("version", "0.10.0.0").put("size", 256).put("sha256", "a".repeat(64));
        Files.writeString(buildFile, metadata.toString());
        var build = SiteDownloadPublisher.desktopBuild(project, assets);
        check(build.version().equals("0.10.0.0"));
        ((tools.jackson.databind.node.ObjectNode) files.get(0)).put("version", "0.9.0.0");
        Files.writeString(buildFile, metadata.toString()); rejected(() -> SiteDownloadPublisher.desktopBuild(project, assets));
        ((tools.jackson.databind.node.ObjectNode) files.get(0)).put("version", "0.10.0.0").put("sha256", "b".repeat(64));
        Files.writeString(buildFile, metadata.toString()); rejected(() -> SiteDownloadPublisher.desktopBuild(project, assets));
        ((tools.jackson.databind.node.ObjectNode) files.get(0)).put("sha256", "a".repeat(64));
        metadata.put("version", "0.11.0.0");
        Files.writeString(buildFile, metadata.toString()); rejected(() -> SiteDownloadPublisher.desktopBuild(project, assets));
        metadata.put("version", "0.10.0.0"); Files.writeString(buildFile, metadata.toString());
        String release = "123456789abcdef0", cdn = "https://cdn.puppyruby.com/site-downloads/" + release;
        var verified = new ArrayList<>(SiteDownloadPublisher.ALLOWED_PATHS);
        rejected(() -> SiteDownloadPublisher.registerUpdate(project, build, assets, release, cdn, 0, verified));
        for (String missing : SiteDownloadPublisher.ALLOWED_PATHS) {
            var partial = new ArrayList<>(verified); partial.remove(missing);
            rejected(() -> SiteDownloadPublisher.registerUpdate(project, build, assets, release, cdn, 4, partial));
        }
        rejected(() -> SiteDownloadPublisher.registerUpdate(project, build, assets, release, cdn, 4, List.of(verified.get(0), verified.get(0), verified.get(0), verified.get(0))));
        rejected(() -> SiteDownloadPublisher.registerUpdate(project, build, assets, release, cdn.replace("cdn.puppyruby.com", "other.example"), 4, verified));
        check(Files.readString(media).equals(oldMedia)); check(Files.readString(latest).equals("null\n"));
        SiteDownloadPublisher.registerUpdate(project, build, assets, release, cdn, 4, verified);
        var registered = SiteDownloadPublisher.JSON.readTree(Files.readString(latest));
        check(registered.path("version").asString().equals(build.version()));
        check(registered.path("release").asString().equals(release));
        check(registered.path("installer").path("sha256").asString().equals("a".repeat(64)));
        check(registered.path("installer").path("size").asLong() == 256);
        check(registered.path("installer").path("url").asString().equals(cdn + "/downloads/PuppyRuby-Setup.exe"));
        check(!registered.path("publishedAt").asString().isEmpty());
        String publishedAt = registered.path("publishedAt").asString();
        check(publishedAt.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,3})?Z"));
        check(java.time.Instant.parse(publishedAt).getNano() % 1_000_000 == 0);
        var publicMedia = SiteDownloadPublisher.JSON.readTree(Files.readString(media));
        check(publicMedia.path("images").equals(SiteDownloadPublisher.JSON.readTree(oldMedia).path("images")));
        check(publicMedia.path("downloads").path("release").asString().equals(release));
        check(publicMedia.path("downloads").path("baseUrl").asString().equals(cdn));
        SiteDownloadPublisher.validatePublishedVersion(project, build, release); check(true);
        rejected(() -> SiteDownloadPublisher.validatePublishedVersion(project, build, "2222222222222222"));
        rejected(() -> SiteDownloadPublisher.validatePublishedVersion(project, new SiteDownloadPublisher.DesktopBuild("0.9.0.0", "older"), "2222222222222222"));
        SiteDownloadPublisher.validatePublishedVersion(project, new SiteDownloadPublisher.DesktopBuild("0.10.1.0", "newer"), "2222222222222222"); check(true);
    }
}
