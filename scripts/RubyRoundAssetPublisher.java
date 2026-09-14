import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import javax.imageio.ImageIO;
import javax.net.ssl.HttpsURLConnection;
import com.puppyruby.game.BreedCatalog;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/** Additive publisher for a single, finite artwork pack. It never enumerates source directories. */
public final class RubyRoundAssetPublisher {
    static final List<String> SCENES = List.of("idle", "side", "walk", "happy", "sleep");
    static final String IMAGE = "images/ruby-round-v1/", DOWNLOAD = "downloads/ruby-round-v1/";
    static final int COUNT = 511;
    static final ObjectMapper JSON = new ObjectMapper();
    static String phase = "plan", current = "";
    static final class Refused extends RuntimeException { Refused(String code) { super(code); } }
    static void require(boolean ok, String code) { if (!ok) throw new Refused(code); }

    public static void main(String[] args) {
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        try { run(args); }
        catch (Throwable error) {
            String code = error instanceof Refused ? error.getMessage() : error instanceof S3Exception ? "S3_REQUEST_FAILED" : "PACK_OPERATION_FAILED";
            try { System.out.println(JSON.writeValueAsString(Map.of("success", false, "phase", phase, "path", current, "error", code,
                "status", error instanceof S3Exception s3 ? s3.statusCode() : 0))); } catch (Exception ignored) {}
            System.exit(1);
        }
    }

    static void run(String[] args) throws Exception {
        require(args.length == 2 && Set.of("Plan", "Publish", "Verify").contains(args[1]), "INVALID_ACTION");
        Path project = Path.of(args[0]).toRealPath(), root = project.resolve("local-assets/site");
        SiteDownloadPublisher.checkedPath(project, root);
        List<SiteDownloadPublisher.Asset> assets = inventory(project, root);
        String hash = releaseHash(assets), release = hash.substring(0, 16);
        String bucket = setting("S3_BUCKET"), region = setting("AWS_REGION"), prefix = setting("S3_KEY_PREFIX").replaceAll("/+$", "");
        require(bucket.equals("fatell-aws-s3") && prefix.equals("puppyruby"), "DESTINATION_OUTSIDE_AUTHORIZED_SCOPE");
        require(region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]"), "INVALID_REGION");
        String keyBase = prefix + "/site-packs/ruby-round-v1/" + release;
        String originPath = System.getenv().getOrDefault("CDN_ORIGIN_PATH", "").strip().replaceAll("^/+|/+$", "");
        String cdn = SiteDownloadPublisher.cdnBase(setting("CDN_BASE_URL"), keyBase, originPath);
        Path output = project.resolve("local-assets/work/ruby-round-v1/releases/" + release);
        Files.createDirectories(output);
        SiteDownloadPublisher.checkedPath(project, output);
        var manifest = new LinkedHashMap<String, Object>();
        manifest.put("release", release); manifest.put("manifestSha256", hash); manifest.put("keyBase", keyBase); manifest.put("cdnBase", cdn);
        manifest.put("count", assets.size()); manifest.put("bytes", assets.stream().mapToLong(SiteDownloadPublisher.Asset::size).sum());
        manifest.put("files", assets.stream().map(a -> Map.of("path", a.path(), "key", keyBase + "/" + a.path(), "bytes", a.size(), "sha256", a.sha256(), "contentType", a.contentType())).toList());
        Files.writeString(output.resolve("manifest.json"), JSON.writeValueAsString(manifest));
        current = "";
        System.out.println("RUBY_ROUND_RELEASE=" + release + " FILES=" + assets.size() + " BYTES=" + manifest.get("bytes"));
        System.out.println("RUBY_ROUND_CDN_BASE=" + cdn);
        System.out.println("RUBY_ROUND_MANIFEST=" + output.resolve("manifest.json"));
        if (args[1].equals("Plan")) { System.out.println("PLAN_ONLY=true"); return; }

        int uploaded = 0, skipped = 0, verified = 0;
        try (S3Client client = S3Client.builder().region(Region.of(region)).credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .endpointOverride(URI.create("https://s3." + region + ".amazonaws.com"))
            .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofMinutes(3)).apiCallAttemptTimeout(Duration.ofMinutes(2))).build()) {
            for (var asset : assets) {
                current = asset.path(); phase = "s3-head";
                String key = keyBase + "/" + asset.path();
                HeadObjectResponse head = head(client, bucket, key);
                if (head == null) {
                    require(!args[1].equals("Verify"), "REMOTE_PACK_ASSET_MISSING");
                    unchanged(asset); phase = "s3-create";
                    try {
                        client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentLength(asset.size()).contentType(asset.contentType())
                            .contentDisposition(asset.disposition()).cacheControl(SiteDownloadPublisher.CACHE).metadata(Map.of("sha256", asset.sha256()))
                            .checksumSHA256(asset.checksum()).ifNoneMatch("*").build(), RequestBody.fromFile(asset.source()));
                        uploaded++;
                    } catch (S3Exception e) { if (e.statusCode() != 412) throw e; skipped++; }
                    head = head(client, bucket, key);
                } else skipped++;
                require(head != null, "REMOTE_PACK_ASSET_MISSING");
                SiteDownloadPublisher.verifyHead(head, asset);
                phase = "s3-body-verify";
                try (InputStream input = client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) { verifyBody(input, asset, "S3_BODY_CHECKSUM_MISMATCH"); }
                phase = "cdn-body-verify"; verifyCdn(cdn, asset);
                verified++;
                if (verified % 25 == 0 || verified == assets.size()) System.out.println("PACK_BODY_VERIFIED=" + verified + "/" + assets.size());
            }
        }
        phase = "local-final-verification"; current = "";
        require(verified == COUNT, "INCOMPLETE_REMOTE_VERIFICATION");
        require(hash.equals(releaseHash(inventory(project, root))), "LOCAL_PACK_CHANGED_DURING_PUBLISH");
        Files.writeString(output.resolve("verification.json"), JSON.writeValueAsString(Map.of("success", true, "release", release,
            "verifiedAt", Instant.now().toString(), "uploaded", uploaded, "existing", skipped, "s3BodyVerified", verified, "cdnBodyVerified", verified,
            "allFiles", assets.stream().map(SiteDownloadPublisher.Asset::path).toList())));
        phase = "activate-verified-pack";
        Path config = project.resolve("frontend/src/lib/generated/ruby-round-media-release.json");
        SiteDownloadPublisher.checkedPath(project, config.getParent());
        if (Files.exists(config)) SiteDownloadPublisher.checkedPath(project, config);
        Path temporary = Files.createTempFile(config.getParent(), "ruby-round-release-", ".tmp");
        Files.writeString(temporary, JSON.writeValueAsString(Map.of("release", release, "baseUrl", cdn)) + "\n", StandardCharsets.UTF_8);
        try { Files.move(temporary, config, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException ignored) { Files.move(temporary, config, StandardCopyOption.REPLACE_EXISTING); }
        System.out.println("RUBY_ROUND_PUBLISH_SUCCESS=true S3_BODY_VERIFIED=" + verified + " CDN_BODY_VERIFIED=" + verified);
    }

    static Set<String> expectedPaths() {
        require(BreedCatalog.IDS.size() == 30 && new HashSet<>(BreedCatalog.IDS).size() == 30, "BREED_CATALOG_CHANGED");
        Set<String> paths = new TreeSet<>();
        for (String breed : BreedCatalog.IDS) {
            require(breed.matches("[a-z]+"), "INVALID_BREED_ID");
            for (String scene : SCENES) for (String variant : List.of("", "-default", "-desktop")) paths.add(IMAGE + breed + "/" + scene + variant + ".png");
            paths.add(DOWNLOAD + breed + ".aseprite");
        }
        for (int i = 1; i <= 30; i++) paths.add(IMAGE + "eyes/eye-%02d.png".formatted(i));
        paths.add(DOWNLOAD + "ruby-round-eyes.aseprite");
        require(paths.size() == COUNT, "PACK_REQUIRES_EXACTLY_511_FILES");
        return Collections.unmodifiableSet(paths);
    }

    static List<SiteDownloadPublisher.Asset> inventory(Path project, Path root) throws Exception {
        var assets = new ArrayList<SiteDownloadPublisher.Asset>();
        Path catalog = project.resolve("frontend/src/lib/generated/ruby-round-scene-assets.json");
        SiteDownloadPublisher.checkedPath(project, catalog);
        JsonNode manifest = JSON.readTree(Files.readString(catalog));
        require(manifest.isArray() && manifest.size() == 30, "ALL_30_BREEDS_MUST_BE_COMPLETE");
        Map<String, JsonNode> entries = new HashMap<>();
        for (JsonNode entry : manifest) {
            String breed = entry.path("breed").asText();
            require(BreedCatalog.IDS.contains(breed) && entries.put(breed, entry) == null, "INVALID_OR_DUPLICATE_BREED");
        }
        for (String breed : BreedCatalog.IDS) {
            JsonNode entry = entries.get(breed);
            require(entry != null, "REGISTERED_BREED_MISSING");
            int width = entry.path("width").asInt(), height = entry.path("height").asInt();
            require(width >= 96 && width <= 2048 && height >= 96 && height <= 2048, "INVALID_NATIVE_CANVAS");
            Path proofPath = project.resolve("local-assets/work/ruby-round-v1/processed/" + breed + "/conversion.json");
            SiteDownloadPublisher.checkedPath(project, proofPath);
            JsonNode proof = JSON.readTree(Files.readString(proofPath));
            require(breed.equals(proof.path("breed").asText()) && proof.path("frames").asInt() == 20 && proof.path("eyeStyles").asInt() == 30
                && proof.path("width").asInt() == width && proof.path("height").asInt() == height && proof.path("retainedArtworkRgbaUnchanged").asBoolean()
                && proof.path("editableRgbaVerified").asBoolean() && !proof.path("resized").asBoolean() && !proof.path("quantized").asBoolean() && !proof.path("fabricatedFrames").asBoolean()
                && entry.path("scenes").equals(proof.path("scenes")), "CONVERSION_PROOF_MISMATCH");
            Path original = project.resolve("local-assets/work/ruby-round-v1/originals/" + breed + ".png");
            SiteDownloadPublisher.checkedPath(project, original);
            verifyHash(SiteDownloadPublisher.digest(original).hex(), proof.path("sourceSha256").asText());
            for (String scene : SCENES) {
                JsonNode sheet = entry.path("scenes").path(scene);
                require(sheet.path("frames").asInt() == 4 && sheet.path("frameMs").asInt() >= 50 && sheet.path("frameMs").asInt() <= 2000
                    && sheet.path("eyes").isArray() && sheet.path("eyes").size() == 4
                    && sheet.path("png").asText().equals("/" + IMAGE + breed + "/" + scene + ".png")
                    && sheet.path("desktopPng").asText().equals("/" + IMAGE + breed + "/" + scene + "-desktop.png")
                    && sheet.path("desktopFrames").asInt() == (scene.equals("walk") ? 4 : 1), "SCENE_MANIFEST_MISMATCH");
                for (String variant : List.of("", "-default", "-desktop")) {
                    String relative = IMAGE + breed + "/" + scene + variant + ".png";
                    var asset = inspect(root, relative);
                    int frames = variant.equals("-desktop") && !scene.equals("walk") ? 1 : 4;
                    validatePng(asset.source(), width * frames, height);
                    verifyHash(asset.sha256(), proof.path("pngSha256").path(scene + variant).asText());
                    assets.add(asset);
                }
            }
            String relative = DOWNLOAD + breed + ".aseprite";
            require(entry.path("aseprite").asText().equals("/" + relative) && proof.path("aseprite").asText().equals("/" + relative), "ASEPRITE_MANIFEST_MISMATCH");
            var master = inspect(root, relative);
            validateAseprite(master, width, height, 20);
            verifyHash(master.sha256(), proof.path("asepriteSha256").asText());
            assets.add(master);
        }
        Set<String> eyeHashes = new HashSet<>();
        for (int i = 1; i <= 30; i++) {
            var eye = inspect(root, IMAGE + "eyes/eye-%02d.png".formatted(i)); validatePng(eye.source(), 32, 16);
            require(eyeHashes.add(eye.sha256()), "COMMON_EYES_MUST_HAVE_30_DISTINCT_SPRITES"); assets.add(eye);
        }
        var master = inspect(root, DOWNLOAD + "ruby-round-eyes.aseprite"); validateAseprite(master, 32, 16, 30); assets.add(master);
        require(new HashSet<>(assets.stream().map(SiteDownloadPublisher.Asset::path).toList()).equals(expectedPaths()) && assets.size() == COUNT, "PACK_PATH_SET_MISMATCH");
        require(assets.stream().mapToLong(SiteDownloadPublisher.Asset::size).sum() <= 1024L * 1024 * 1024, "PACK_TOO_LARGE");
        assets.sort(Comparator.comparing(SiteDownloadPublisher.Asset::path));
        return List.copyOf(assets);
    }

    static SiteDownloadPublisher.Asset inspect(Path root, String relative) throws Exception {
        require(expectedPaths().contains(relative), "UNREVIEWED_PACK_PATH"); current = relative;
        Path source = root.resolve(relative);
        SiteDownloadPublisher.checkedPath(root, source);
        require(Files.isRegularFile(source), "NON_REGULAR_PACK_ASSET");
        long size = Files.size(source);
        require(size > 0 && size <= SiteDownloadPublisher.MAX_FILE_BYTES, "PACK_ASSET_SIZE_INVALID");
        String type = relative.endsWith(".png") ? "image/png" : SiteDownloadPublisher.validateFile(source, relative, size);
        String disposition = relative.endsWith(".png") ? "inline" : "attachment; filename=\"" + source.getFileName() + "\"";
        var digest = SiteDownloadPublisher.digest(source);
        require(digest.bytes() == size, "LOCAL_PACK_CHANGED_DURING_PLAN");
        return new SiteDownloadPublisher.Asset(source, relative, type, disposition, size, digest.hex(), digest.base64());
    }
    static void validatePng(Path source, int width, int height) throws Exception {
        byte[] header;
        try (InputStream input = Files.newInputStream(source)) { header = input.readNBytes(33); }
        require(header.length == 33 && ByteBuffer.wrap(header).getLong() == 0x89504E470D0A1A0AL
            && ByteBuffer.wrap(header).getInt(12) == 0x49484452 && ByteBuffer.wrap(header).getInt(16) == width
            && ByteBuffer.wrap(header).getInt(20) == height && header[24] == 8 && header[25] == 6, "PNG_HEADER_MISMATCH");
        var decoded = ImageIO.read(source.toFile());
        require(decoded != null && decoded.getWidth() == width && decoded.getHeight() == height && decoded.getColorModel().hasAlpha(), "PNG_DECODE_MISMATCH");
        decoded.flush();
    }
    static void validateAseprite(SiteDownloadPublisher.Asset asset, int width, int height, int frames) throws Exception {
        SiteDownloadPublisher.validateFile(asset.source(), asset.path(), asset.size());
        byte[] header;
        try (InputStream input = Files.newInputStream(asset.source())) { header = input.readNBytes(128); }
        var bytes = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        require(Short.toUnsignedInt(bytes.getShort(6)) == frames && Short.toUnsignedInt(bytes.getShort(8)) == width
            && Short.toUnsignedInt(bytes.getShort(10)) == height && bytes.getShort(12) == 32, "ASEPRITE_NATIVE_FRAME_MISMATCH");
    }
    static void verifyHash(String actual, String expected) { require(expected.matches("(?i)[a-f0-9]{64}") && actual.equalsIgnoreCase(expected), "LOCAL_CONVERSION_HASH_MISMATCH"); }
    static void unchanged(SiteDownloadPublisher.Asset asset) throws Exception { var now = SiteDownloadPublisher.digest(asset.source()); require(now.bytes() == asset.size() && now.hex().equals(asset.sha256()), "LOCAL_PACK_CHANGED_AFTER_PLAN"); }
    static String releaseHash(List<SiteDownloadPublisher.Asset> assets) throws Exception {
        StringBuilder canonical = new StringBuilder();
        for (var a : assets) canonical.append(a.path()).append('\t').append(a.contentType()).append('\t').append(a.disposition()).append('\t')
            .append(SiteDownloadPublisher.CACHE).append('\t').append(a.size()).append('\t').append(a.sha256()).append('\n');
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
    }
    static void verifyBody(InputStream input, SiteDownloadPublisher.Asset asset, String code) throws Exception {
        var hash = SiteDownloadPublisher.digest(input, asset.size()); require(hash.bytes() == asset.size() && hash.hex().equals(asset.sha256()), code);
    }
    static HeadObjectResponse head(S3Client client, String bucket, String key) {
        try { return client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).checksumMode(ChecksumMode.ENABLED).build()); }
        catch (S3Exception error) { if (error.statusCode() == 404) return null; throw error; }
    }
    static void verifyCdn(String base, SiteDownloadPublisher.Asset asset) throws Exception {
        var connection = (HttpsURLConnection) URI.create(base + "/" + asset.path()).toURL().openConnection();
        connection.setRequestMethod("GET"); connection.setConnectTimeout(15000); connection.setReadTimeout(60000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            require(connection.getResponseCode() == 200, "CDN_HTTP_NOT_200");
            require(asset.contentType().equals(Objects.toString(connection.getContentType(), "").split(";", 2)[0].strip())
                && asset.disposition().equals(connection.getHeaderField("Content-Disposition"))
                && Objects.toString(connection.getHeaderField("Cache-Control"), "").contains("immutable"), "CDN_METADATA_MISMATCH");
            try (InputStream input = connection.getInputStream()) { verifyBody(input, asset, "CDN_BODY_CHECKSUM_MISMATCH"); }
        } finally { connection.disconnect(); }
    }
    static String setting(String key) { String value = System.getenv(key); require(value != null && !value.isBlank(), "REQUIRED_SETTING_MISSING"); return value.strip(); }
}
