import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import javax.imageio.ImageIO;
import javax.net.ssl.HttpsURLConnection;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import com.puppyruby.game.BreedCatalog;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/** Publishes only the explicitly scoped public image assets, never downloads or application data. */
public final class SiteAssetPublisher {
    private static final String CACHE = "public, max-age=31536000, immutable";
    /** Shared site chrome only. Dog artwork is published exclusively by RubyRoundAssetPublisher. */
    static final Set<String> PUBLIC_PATHS = Set.of(
        "favicon.svg",
        "images/cozy-room.png",
        "images/pixel-garden.svg"
    );
    private static final Set<String> CDN_SAMPLES = PUBLIC_PATHS;
    private static final String CUTE_DIRECTORY = "images/cute-puppies-v1/";
    private static final Set<String> CUTE_PATHS = cutePaths();
    private static final String PREMIUM_DIRECTORY = "images/premium-puppies-v1/";
    private static final Set<String> PREMIUM_PATHS = premiumPaths();
    private static final String ART_DOGS_DIRECTORY = "images/pixel-art-dogs-v1/";
    private static final Set<String> ART_DOG_PATHS = artDogPaths();
    private static final String ART16_DIRECTORY = "images/art16-scenes-v1/";
    private static final List<String> ART16_SCENES = List.of("idle", "side", "walk", "happy", "sleep");
    private static final Set<String> ART16_PATHS = art16Paths();
    private static final String SOFT_DIRECTORY = "images/soft-pixel-v1/";
    private static final List<String> SOFT_LAYERS = List.of("body", "eyes-dot", "eyes-bean", "eyes-sparkle", "eyes-sleep", "preview");
    private static final Set<String> SOFT_PATHS = softPaths();
    private static final String SP_DIRECTORY = "images/sp-scenes-v1/";
    private static final List<String> SP_STYLES = List.of("sp08", "sp15");
    private static final List<String> SP_SCENES = List.of("idle", "side", "walk", "happy", "sleep", "wag");
    private static final Set<String> SP_PATHS = spPaths();
    private static final String SP_BASELINE_RELEASE = "9778dfced2fc07a6";
    private static final String CONSOLIDATION_BASELINE_RELEASE = "074fc31496df79f6";
    private static final Set<String> DOC_PREVIEW_PATHS = Set.of("images/docs-previews/dog-breeds-30.png", "images/docs-previews/dog-styles-16.png", "images/docs-previews/meadow-samoyed.png", "images/docs-previews/shiba-coats-10.png");
    private static String phase = "plan", currentPath = "";
    private record Asset(Path source, String path, String contentType, String disposition, long size, String sha256, String checksum) {}

    /** Exact allowlist: local legacy style folders can never enter a future site release. */
    static List<Path> collectSources(Path publicRoot) throws IOException {
        return PUBLIC_PATHS.stream().sorted().map(publicRoot::resolve).toList();
    }

    public static void main(String[] args) {
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        try { run(args); }
        catch (Throwable error) {
            String code = error instanceof Refused refused ? refused.code : error instanceof S3Exception ? "S3_REQUEST_FAILED" : "ASSET_OPERATION_FAILED";
            int status = error instanceof S3Exception s3 ? s3.statusCode() : 0;
            System.out.println("{\"success\":false,\"phase\":" + quote(phase) + ",\"path\":" + quote(currentPath) + ",\"error\":" + quote(code) + ",\"status\":" + status + "}");
            System.exit(1);
        }
    }

    private static void run(String[] args) throws Exception {
        if (args.length != 2 || !Set.of("Plan", "Publish", "Verify").contains(args[1])) throw new Refused("INVALID_ACTION");
        Path project = Path.of(args[0]).toRealPath(), publicRoot = project.resolve("local-assets/site").toRealPath();
        if (!publicRoot.equals(project.resolve("local-assets/site")) || !publicRoot.startsWith(project)) throw new Refused("SOURCE_ROOT_OUTSIDE_PROJECT");
        Path images = publicRoot.resolve("images").toRealPath();
        if (!images.startsWith(publicRoot)) throw new Refused("IMAGE_ROOT_OUTSIDE_PUBLIC");
        var sources = collectSources(publicRoot);
        var assets = new ArrayList<Asset>();
        for (Path source : sources) {
            Path real = source.toRealPath();
            if (!real.startsWith(publicRoot) || Files.isSymbolicLink(source) || !Files.isRegularFile(real)) throw new Refused("SOURCE_PATH_OUTSIDE_SCOPE");
            String relative = publicRoot.relativize(source).toString().replace('\\', '/');
            if (!relative.matches("(?:images/[A-Za-z0-9/_-]+\\.(?:png|svg)|favicon\\.svg)")) throw new Refused("UNSUPPORTED_ASSET_PATH");
            currentPath = relative;
            long size = Files.size(source);
            if (size < 1 || size > 10 * 1024 * 1024) throw new Refused("ASSET_SIZE_OUT_OF_RANGE");
            byte[] bytes = Files.readAllBytes(source);
            String type = validateImage(relative, bytes);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            String disposition = "inline";
            assets.add(new Asset(source, relative, type, disposition, size, HexFormat.of().formatHex(digest), Base64.getEncoder().encodeToString(digest)));
        }
        assets.sort(Comparator.comparing(Asset::path));
        if (assets.size() != PUBLIC_PATHS.size() || assets.stream().map(Asset::path).distinct().count() != assets.size()) throw new Refused("INVALID_ASSET_INVENTORY");
        Set<String> assetPaths = new HashSet<>(assets.stream().map(Asset::path).toList());
        validateSiteInventory(assetPaths);
        Set<String> cdnSamples = cdnSamplesFor(assetPaths);
        StringBuilder canonical = new StringBuilder();
        for (Asset asset : assets) canonical.append(asset.path()).append('\t').append(asset.contentType()).append('\t').append(asset.disposition())
            .append('\t').append(CACHE).append('\t').append(asset.size()).append('\t').append(asset.sha256()).append('\n');
        String manifestSha = sha(canonical.toString().getBytes(StandardCharsets.UTF_8));
        String release = manifestSha.substring(0, 16);
        String bucket = required("S3_BUCKET"), region = required("AWS_REGION"), prefix = required("S3_KEY_PREFIX").replaceAll("/+$", "");
        // This task is authorized for this project's configured existing bucket and prefix only.
        if (!bucket.equals("fatell-aws-s3") || !prefix.equals("puppyruby")) throw new Refused("DESTINATION_OUTSIDE_AUTHORIZED_SCOPE");
        if (!region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]")) throw new Refused("INVALID_REGION");
        URI cdn = URI.create(required("CDN_BASE_URL").replaceAll("/+$", ""));
        if (!"https".equals(cdn.getScheme()) || cdn.getHost() == null || cdn.getUserInfo() != null || cdn.getQuery() != null || cdn.getFragment() != null || !cdn.getPath().matches("(?:/[A-Za-z0-9_-]+)*")) throw new Refused("INVALID_CDN_BASE");
        String keyBase = prefix + "/site-assets/" + release;
        String originPath = System.getenv().getOrDefault("CDN_ORIGIN_PATH", "").strip().replaceAll("^/+|/+$", "");
        if (!originPath.isEmpty() && (!originPath.matches("[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*") || !keyBase.startsWith(originPath + "/"))) throw new Refused("CDN_ORIGIN_PATH_NOT_AN_EXACT_KEY_PREFIX");
        String cdnKeyBase = originPath.isEmpty() ? keyBase : keyBase.substring(originPath.length() + 1);
        String cdnBase = cdn + "/" + cdnKeyBase;
        Path output = project.resolve("local-assets/work/site-assets/" + release);
        Files.createDirectories(output);
        if (!output.toRealPath().startsWith(project)) throw new Refused("OUTPUT_PATH_OUTSIDE_PROJECT");
        long totalBytes = assets.stream().mapToLong(Asset::size).sum();
        Files.writeString(output.resolve("manifest.json"), manifest(assets, manifestSha, release, keyBase, cdnBase, originPath, totalBytes), StandardCharsets.UTF_8);
        currentPath = "";
        System.out.println("ASSET_RELEASE=" + release);
        System.out.println("ASSET_CDN_BASE=" + cdnBase);
        System.out.println("ASSET_COUNT=" + assets.size());
        System.out.println("ASSET_TOTAL_BYTES=" + totalBytes);
        System.out.println("ASSET_MANIFEST=" + output.resolve("manifest.json"));
        if (args[1].equals("Plan")) { System.out.println("PLAN_ONLY=true"); return; }

        int uploaded = 0, skipped = 0;
        try (var client = S3Client.builder().region(Region.of(region)).credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .endpointOverride(URI.create("https://s3." + region + ".amazonaws.com"))
            .overrideConfiguration(value -> value.apiCallTimeout(Duration.ofSeconds(40)).apiCallAttemptTimeout(Duration.ofSeconds(20))).build()) {
            for (Asset asset : assets) {
                phase = "s3-head"; currentPath = asset.path();
                String key = keyBase + "/" + asset.path();
                HeadObjectResponse head = head(client, bucket, key);
                if (head != null) { verifyHead(head, asset); skipped++; }
                else {
                    if (args[1].equals("Verify")) throw new Refused("REMOTE_ASSET_MISSING");
                    phase = "s3-create";
                    byte[] bytes = Files.readAllBytes(asset.source());
                    if (!sha(bytes).equals(asset.sha256())) throw new Refused("LOCAL_ASSET_CHANGED_AFTER_PLAN");
                    try {
                        client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(asset.contentType())
                            .contentDisposition(asset.disposition()).contentLength(asset.size()).cacheControl(CACHE).checksumSHA256(asset.checksum()).ifNoneMatch("*").build(), RequestBody.fromBytes(bytes));
                        uploaded++;
                    } catch (S3Exception conflict) {
                        if (conflict.statusCode() != 412) throw conflict;
                        skipped++;
                    }
                    phase = "s3-verify";
                    HeadObjectResponse saved = head(client, bucket, key);
                    if (saved == null) throw new Refused("CREATED_ASSET_NOT_FOUND");
                    verifyHead(saved, asset);
                }
                System.out.println("S3_VERIFIED=" + asset.path());
            }
        }
        Files.writeString(output.resolve("s3-verification.json"), "{\n  \"success\": true,\n  \"verifiedAt\": " + quote(Instant.now().toString())
            + ",\n  \"release\": " + quote(release) + ",\n  \"uploaded\": " + uploaded + ",\n  \"alreadyPresent\": " + skipped
            + ",\n  \"s3Verified\": " + assets.size() + ",\n  \"checksumAndMetadataMatch\": true\n}\n", StandardCharsets.UTF_8);
        phase = "cdn-verify";
        var verified = new ArrayList<String>();
        for (Asset asset : assets) if (cdnSamples.contains(asset.path())) {
            currentPath = asset.path();
            var connection = (HttpsURLConnection) URI.create(cdnBase + "/" + asset.path()).toURL().openConnection();
            connection.setRequestMethod("GET"); connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            try {
                int status = connection.getResponseCode();
                if (status != 200) throw new Refused("CDN_HTTP_" + status);
                String type = Objects.toString(connection.getContentType(), "").split(";", 2)[0].trim();
                if (!asset.contentType().equals(type)) throw new Refused("CDN_CONTENT_TYPE_MISMATCH");
                if (!asset.disposition().equals(connection.getHeaderField("Content-Disposition"))) throw new Refused("CDN_CONTENT_DISPOSITION_MISMATCH");
                if (!Objects.toString(connection.getHeaderField("Cache-Control"), "").contains("immutable")) throw new Refused("CDN_CACHE_CONTROL_MISMATCH");
                try (InputStream input = connection.getInputStream()) {
                    byte[] bytes = input.readNBytes(Math.toIntExact(asset.size()) + 1);
                    if (bytes.length != asset.size() || !sha(bytes).equals(asset.sha256())) throw new Refused("CDN_BODY_CHECKSUM_MISMATCH");
                }
                verified.add(asset.path());
                System.out.println("CDN_BODY_VERIFIED=" + asset.path());
            } finally { connection.disconnect(); }
        }
        if (verified.size() != cdnSamples.size()) throw new Refused("CDN_SAMPLE_MISSING_FROM_INVENTORY");
        String verification = "{\n  \"success\": true,\n  \"verifiedAt\": " + quote(Instant.now().toString())
            + ",\n  \"release\": " + quote(release) + ",\n  \"uploaded\": " + uploaded + ",\n  \"alreadyPresent\": " + skipped
            + ",\n  \"s3Verified\": " + assets.size() + ",\n  \"cdnBodyVerified\": [" + String.join(", ", verified.stream().map(SiteAssetPublisher::quote).toList()) + "]\n}\n";
        Files.writeString(output.resolve("verification.json"), verification, StandardCharsets.UTF_8);
        Files.writeString(output.resolve("cdn-verification.json"), verification, StandardCharsets.UTF_8);
        currentPath = "";
        System.out.println("ASSET_PUBLISH_SUCCESS=true UPLOADED=" + uploaded + " EXISTING=" + skipped + " S3_VERIFIED=" + assets.size() + " CDN_VERIFIED=" + verified.size());
    }

    private static HeadObjectResponse head(S3Client client, String bucket, String key) {
        try { return client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).checksumMode(ChecksumMode.ENABLED).build()); }
        catch (S3Exception error) { if (error.statusCode() == 404) return null; throw error; }
    }

    static Set<String> cdnSamplesFor(Set<String> paths) {
        validateSiteInventory(paths);
        return CDN_SAMPLES;
    }

    static void validateSiteInventory(Set<String> paths) {
        if (!paths.equals(PUBLIC_PATHS)) throw new Refused("SITE_COLLECTION_REQUIRES_EXACTLY_3_SHARED_FILES_WITHOUT_LEGACY_DOG_STYLES");
    }

    private static Set<String> cutePaths() {
        Set<String> paths = new HashSet<>();
        for (String family : List.of("cozy", "bean", "bright", "button"))
            for (String body : List.of("chubby", "slim", "tall", "loaf")) paths.add(CUTE_DIRECTORY + family + "-" + body + ".png");
        return Set.copyOf(paths);
    }

    private static Set<String> premiumPaths() {
        Set<String> paths = new HashSet<>();
        for (String name : List.of("marshmallow", "milkbean", "honeybun", "cloudpuff", "biscuit", "naploaf",
            "teddycub", "peachcheek", "buttonpaw", "rounddrop", "cottonball", "caramel"))
            paths.add(PREMIUM_DIRECTORY + "premium-" + name + ".png");
        return Set.copyOf(paths);
    }

    private static Set<String> artDogPaths() {
        Set<String> paths = new HashSet<>();
        for (int index = 1; index <= 30; index++) paths.add(ART_DOGS_DIRECTORY + "art-%02d.png".formatted(index));
        return Set.copyOf(paths);
    }

    private static Set<String> art16Paths() {
        Set<String> paths = new HashSet<>();
        for (String breed : BreedCatalog.IDS) for (String scene : ART16_SCENES) paths.add(ART16_DIRECTORY + breed + "/" + scene + ".png");
        return Set.copyOf(paths);
    }

    private static Set<String> softPaths() {
        Set<String> paths = new HashSet<>();
        for (int index = 1; index <= 15; index++) for (String layer : SOFT_LAYERS)
            paths.add(SOFT_DIRECTORY + "sp-%02d/".formatted(index) + layer + ".png");
        return Set.copyOf(paths);
    }

    private static Set<String> spPaths() {
        Set<String> paths = new HashSet<>();
        for (String style : SP_STYLES) for (String breed : BreedCatalog.IDS) for (String scene : SP_SCENES)
            paths.add(SP_DIRECTORY + style + "/" + breed + "/" + scene + ".png");
        return Set.copyOf(paths);
    }

    static void validateSpInventory(Set<String> paths) {
        if (SP_PATHS.size() != 360 || paths.size() != 705 || !paths.containsAll(SP_PATHS)) throw new Refused("SP_COLLECTION_REQUIRES_360_SCENES_AND_345_EXISTING_ASSETS");
        Set<String> existing = new HashSet<>(paths);
        existing.removeAll(SP_PATHS);
        validateSoftInventory(existing);
    }

    static void validateSpManifest(JsonNode manifest) {
        if (!manifest.isArray() || manifest.size() != 60) throw new Refused("SP_INVALID_MANIFEST");
        Set<String> sets = new HashSet<>();
        for (JsonNode entry : manifest) {
            String style = entry.path("style").asText(), breed = entry.path("breed").asText();
            if (!SP_STYLES.contains(style) || !BreedCatalog.IDS.contains(breed) || !sets.add(style + "/" + breed)
                || !spDimension(entry.path("width")) || !spDimension(entry.path("height"))
                || !("/downloads/sp-scenes-v1/" + style + "/" + breed + ".aseprite").equals(entry.path("aseprite").asText()))
                throw new Refused("SP_INVALID_BREED_MANIFEST");
            for (String scene : SP_SCENES) {
                JsonNode sheet = entry.path("scenes").path(scene);
                int frames = scene.equals("walk") ? 8 : scene.equals("wag") ? 4 : 1;
                int duration = scene.equals("walk") ? 125 : scene.equals("wag") ? 150 : scene.equals("sleep") ? 1000 : 600;
                if (!("/" + SP_DIRECTORY + style + "/" + breed + "/" + scene + ".png").equals(sheet.path("png").asText())
                    || !sheet.path("frames").isInt() || sheet.path("frames").intValue() != frames
                    || !sheet.path("frameMs").isInt() || sheet.path("frameMs").intValue() != duration
                    || !entry.path("frameBounds").path(scene).isArray() || entry.path("frameBounds").path(scene).size() != frames)
                    throw new Refused("SP_INVALID_SCENE_MANIFEST");
            }
        }
    }

    private static boolean spDimension(JsonNode value) { return value.isInt() && value.intValue() >= 192 && value.intValue() <= 4096; }

    private static void validateSpFiles(Path project, Path publicRoot) throws Exception {
        var mapper = new ObjectMapper();
        JsonNode compiled = mapper.readTree(Files.readString(project.resolve("frontend/src/lib/generated/sp-scene-assets.json")));
        validateSpManifest(compiled);
        JsonNode manifest = mapper.readTree(Files.readString(publicRoot.resolve(SP_DIRECTORY + "manifest.json")));
        if (!manifest.path("complete").asBoolean() || !compiled.equals(manifest.path("breeds"))) throw new Refused("SP_COMPILED_MANIFEST_MISMATCH");
        for (JsonNode entry : compiled) {
            String style = entry.path("style").asText(), breed = entry.path("breed").asText();
            int width = entry.path("width").intValue(), height = entry.path("height").intValue();
            JsonNode proof = mapper.readTree(Files.readString(project.resolve("local-assets/work/sp-scenes-v1/" + style + "/processed/" + breed + "/conversion.json")));
            if (!style.equals(proof.path("style").asText()) || !breed.equals(proof.path("breed").asText())
                || !proof.path("exactVisibleRgba").asBoolean() || !proof.path("editableRgbaVerified").asBoolean() || !proof.path("sourcePreserved").asBoolean()
                || proof.path("resized").asBoolean() || proof.path("quantized").asBoolean() || proof.path("recolored").asBoolean() || proof.path("fabricatedFrames").asBoolean()
                || proof.path("frames").intValue() != 16 || proof.path("uniqueWalkFrames").intValue() != 8 || proof.path("uniqueWagFrames").intValue() != 4
                || proof.path("width").intValue() != width || proof.path("height").intValue() != height)
                throw new Refused("SP_SOURCE_PRESERVATION_NOT_VERIFIED");
            JsonNode cleanup = proof.path("outerMagentaCleanup");
            if (!"exterior-connected-saturated-magenta".equals(cleanup.path("method").asText())
                || !cleanup.path("afterRegistration").asBoolean() || cleanup.path("rMin").intValue() != 120
                || cleanup.path("bMin").intValue() != 120 || cleanup.path("gMax").intValue() != 80
                || cleanup.path("differenceMin").intValue() != 90 || !proof.path("removedOuterMagentaPixels").isNumber())
                throw new Refused("SP_EXTERIOR_KEY_CLEANUP_NOT_VERIFIED");
            Path original = project.resolve("local-assets/work/sp-scenes-v1/" + style + "/originals/" + breed + ".png");
            if (!sha(Files.readAllBytes(original)).equalsIgnoreCase(proof.path("sourceSha256").asText())) throw new Refused("SP_SOURCE_HASH_CHANGED");
            for (String scene : SP_SCENES) {
                JsonNode sheet = entry.path("scenes").path(scene);
                Path imagePath = publicRoot.resolve(sheet.path("png").asText().substring(1)).toRealPath();
                if (!imagePath.startsWith(publicRoot) || Files.isSymbolicLink(imagePath)) throw new Refused("SP_IMAGE_PATH_OUTSIDE_PUBLIC");
                byte[] bytes = Files.readAllBytes(imagePath);
                if (!sha(bytes).equalsIgnoreCase(proof.path("pngSha256").path(scene).asText())) throw new Refused("SP_SCENE_HASH_CHANGED");
                var image = ImageIO.read(new ByteArrayInputStream(bytes));
                if (image == null || image.getWidth() != width * sheet.path("frames").intValue() || image.getHeight() != height)
                    throw new Refused("SP_SCENE_DIMENSIONS_MISMATCH");
            }
            Path editable = publicRoot.resolve(entry.path("aseprite").asText().substring(1)).toRealPath();
            if (!editable.startsWith(publicRoot) || Files.isSymbolicLink(editable)) throw new Refused("SP_EDITABLE_PATH_OUTSIDE_PUBLIC");
            byte[] bytes = Files.readAllBytes(editable);
            if (!sha(bytes).equalsIgnoreCase(proof.path("asepriteSha256").asText()) || bytes.length < 128) throw new Refused("SP_EDITABLE_HASH_CHANGED");
            var data = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            if ((data.getShort(4) & 0xffff) != 0xa5e0 || data.getShort(6) != 16 || data.getShort(8) != width || data.getShort(10) != height || data.getShort(12) != 32)
                throw new Refused("SP_EDITABLE_DIMENSIONS_MISMATCH");
        }
    }

    private static void validateSpBaseline(Path project, List<Asset> assets) throws Exception {
        JsonNode baseline = new ObjectMapper().readTree(Files.readString(project.resolve("local-assets/work/site-assets/" + SP_BASELINE_RELEASE + "/manifest.json")));
        if (!SP_BASELINE_RELEASE.equals(baseline.path("release").asText()) || !baseline.path("files").isArray() || baseline.path("files").size() != 345)
            throw new Refused("SP_EXISTING_BASELINE_INVALID");
        Map<String, Asset> byPath = new HashMap<>();
        for (Asset asset : assets) byPath.put(asset.path(), asset);
        Set<String> previousPaths = new HashSet<>();
        for (JsonNode file : baseline.path("files")) {
            String name = file.path("path").asText();
            Asset asset = byPath.get(name);
            if (!previousPaths.add(name) || SP_PATHS.contains(name) || asset == null || asset.size() != file.path("bytes").longValue()
                || !asset.sha256().equals(file.path("sha256").asText()) || !asset.contentType().equals(file.path("contentType").asText())
                || !asset.disposition().equals(file.path("contentDisposition").asText())) throw new Refused("SP_EXISTING_345_ASSETS_CHANGED");
        }
        validateSoftInventory(previousPaths);
    }

    private static void validateConsolidationBaseline(Path project, List<Asset> assets) throws Exception {
        JsonNode baseline = new ObjectMapper().readTree(Files.readString(project.resolve("local-assets/work/site-assets/" + CONSOLIDATION_BASELINE_RELEASE + "/manifest.json")));
        if (!CONSOLIDATION_BASELINE_RELEASE.equals(baseline.path("release").asText()) || !baseline.path("files").isArray() || baseline.path("files").size() != 705)
            throw new Refused("CONSOLIDATION_BASELINE_INVALID");
        Map<String, Asset> byPath = new HashMap<>();
        for (Asset asset : assets) byPath.put(asset.path(), asset);
        Set<String> previousPaths = new HashSet<>();
        for (JsonNode file : baseline.path("files")) {
            String name = file.path("path").asText();
            Asset asset = byPath.get(name);
            if (!previousPaths.add(name) || DOC_PREVIEW_PATHS.contains(name) || asset == null || asset.size() != file.path("bytes").longValue()
                || !asset.sha256().equals(file.path("sha256").asText()) || !asset.contentType().equals(file.path("contentType").asText())
                || !asset.disposition().equals(file.path("contentDisposition").asText())) throw new Refused("CONSOLIDATION_EXISTING_705_ASSETS_CHANGED");
        }
        validateSpInventory(previousPaths);
    }

    static void validateSoftInventory(Set<String> paths) {
        Set<String> expected = new HashSet<>(Set.of("favicon.svg", "images/puppies.png", "images/pixel-garden.svg", "images/cozy-room.png", "images/puppy-style-preview.png"));
        for (int index = 1; index <= 30; index++) expected.add("images/pixel-art-v1/art-%02d.png".formatted(index));
        for (int index = 1; index <= 12; index++) expected.add("images/imaginary-pixel-v1/C%02d.png".formatted(index));
        for (Set<String> collection : List.of(CUTE_PATHS, PREMIUM_PATHS, ART_DOG_PATHS, ART16_PATHS, SOFT_PATHS)) expected.addAll(collection);
        if (expected.size() != 345 || !paths.equals(expected)) throw new Refused("SOFT_COLLECTION_REQUIRES_90_LAYERS_AND_255_EXISTING_ASSETS");
    }

    static void validateSoftManifest(JsonNode manifest) {
        if (!manifest.isArray() || manifest.size() != 15) throw new Refused("SOFT_INVALID_MANIFEST");
        Set<String> ids = new HashSet<>();
        for (JsonNode entry : manifest) {
            String id = entry.path("id").asText(), prefix = "/" + SOFT_DIRECTORY + id + "/";
            if (!id.matches("sp-(?:0[1-9]|1[0-5])") || !ids.add(id)
                || !entry.path("width").isInt() || entry.path("width").intValue() != 192
                || !entry.path("height").isInt() || entry.path("height").intValue() != 192
                || !entry.path("name").isString() || entry.path("name").asText().isBlank()
                || !"bean".equals(entry.path("defaultEyes").asText())
                || !(prefix + "body.png").equals(entry.path("body").asText())
                || !(prefix + "preview.png").equals(entry.path("png").asText())
                || !("/downloads/soft-pixel-v1/" + id + ".aseprite").equals(entry.path("aseprite").asText()))
                throw new Refused("SOFT_INVALID_CANDIDATE_MANIFEST");
            for (String eye : List.of("dot", "bean", "sparkle", "sleep"))
                if (!(prefix + "eyes-" + eye + ".png").equals(entry.path("eyes").path(eye).asText()))
                    throw new Refused("SOFT_INVALID_EYE_LAYER_MANIFEST");
            if (!entry.path("eyeAnchors").isArray() || entry.path("eyeAnchors").size() != 2)
                throw new Refused("SOFT_INVALID_EYE_ANCHORS");
            for (JsonNode anchor : entry.path("eyeAnchors")) for (String coordinate : List.of("x", "y", "rx", "ry"))
                if (!anchor.path(coordinate).isNumber() || !Double.isFinite(anchor.path(coordinate).doubleValue())
                    || anchor.path(coordinate).doubleValue() <= 0 || anchor.path(coordinate).doubleValue() >= 192)
                    throw new Refused("SOFT_INVALID_EYE_ANCHORS");
        }
    }

    private static void validateSoftFiles(Path project, Path publicRoot) throws Exception {
        JsonNode manifest = new ObjectMapper().readTree(Files.readString(project.resolve("frontend/src/lib/generated/soft-pixel-candidates.json")));
        validateSoftManifest(manifest);
        for (JsonNode entry : manifest) {
            Path editable = publicRoot.resolve(entry.path("aseprite").asText().substring(1)).toRealPath();
            if (!editable.startsWith(publicRoot) || Files.isSymbolicLink(editable)) throw new Refused("SOFT_EDITABLE_PATH_OUTSIDE_PUBLIC");
            try (InputStream input = Files.newInputStream(editable)) {
                byte[] header = input.readNBytes(128);
                if (header.length != 128) throw new Refused("SOFT_EDITABLE_HEADER_MISSING");
                var data = java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN);
                if ((data.getShort(4) & 0xffff) != 0xa5e0 || data.getShort(6) != 1 || data.getShort(8) != 192 || data.getShort(10) != 192 || data.getShort(12) != 32)
                    throw new Refused("SOFT_EDITABLE_DIMENSIONS_MISMATCH");
            }
        }
    }

    static void validateArt16Manifest(JsonNode manifest) {
        if (!manifest.isObject() || !manifest.path("version").isInt() || manifest.path("version").intValue() != 1
            || !"art-16-scenes".equals(manifest.path("styleId").asText()) || !manifest.path("breeds").isArray()
            || manifest.path("breeds").size() != BreedCatalog.IDS.size()) throw new Refused("ART16_INVALID_MANIFEST");
        Set<String> breeds = new HashSet<>();
        for (JsonNode entry : manifest.path("breeds")) {
            String breed = entry.path("breed").asText();
            if (!BreedCatalog.IDS.contains(breed) || !breeds.add(breed) || !art16Dimension(entry.path("width")) || !art16Dimension(entry.path("height"))
                || !("/downloads/art16-scenes-v1/" + breed + ".aseprite").equals(entry.path("aseprite").asText()) || !entry.path("scenes").isObject())
                throw new Refused("ART16_INVALID_BREED_MANIFEST");
            for (String scene : ART16_SCENES) {
                JsonNode sheet = entry.path("scenes").path(scene);
                if (!("/" + ART16_DIRECTORY + breed + "/" + scene + ".png").equals(sheet.path("png").asText())
                    || !sheet.path("frames").isInt() || sheet.path("frames").intValue() != (scene.equals("walk") ? 8 : 1)
                    || !sheet.path("frameMs").isInt() || sheet.path("frameMs").intValue() < 50 || sheet.path("frameMs").intValue() > 2000)
                    throw new Refused("ART16_INVALID_SCENE_MANIFEST");
            }
        }
    }
    private static boolean art16Dimension(JsonNode value) { return value.isInt() && value.intValue() >= 256 && value.intValue() <= 4096; }

    private static void validateArt16Files(Path project, Path publicRoot) throws Exception {
        var mapper = new ObjectMapper();
        JsonNode manifest = mapper.readTree(Files.readString(publicRoot.resolve(ART16_DIRECTORY + "manifest.json")));
        validateArt16Manifest(manifest);
        JsonNode compiled = mapper.readTree(Files.readString(project.resolve("frontend/src/lib/generated/art16-scene-assets.json")));
        if (!compiled.equals(manifest.path("breeds"))) throw new Refused("ART16_COMPILED_MANIFEST_MISMATCH");
        for (JsonNode entry : compiled) {
            int width = entry.path("width").intValue(), height = entry.path("height").intValue();
            for (String scene : ART16_SCENES) {
                JsonNode sheet = entry.path("scenes").path(scene);
                Path imagePath = publicRoot.resolve(sheet.path("png").asText().substring(1)).toRealPath();
                if (!imagePath.startsWith(publicRoot)) throw new Refused("ART16_IMAGE_PATH_OUTSIDE_PUBLIC");
                var image = ImageIO.read(imagePath.toFile());
                if (image == null || image.getWidth() != width * sheet.path("frames").intValue() || image.getHeight() != height)
                    throw new Refused("ART16_SCENE_DIMENSIONS_MISMATCH");
            }
            Path editable = publicRoot.resolve(entry.path("aseprite").asText().substring(1)).toRealPath();
            if (!editable.startsWith(publicRoot) || Files.isSymbolicLink(editable)) throw new Refused("ART16_EDITABLE_PATH_OUTSIDE_PUBLIC");
            try (InputStream input = Files.newInputStream(editable)) {
                byte[] header = input.readNBytes(128);
                if (header.length != 128) throw new Refused("ART16_EDITABLE_HEADER_MISSING");
                var data = java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN);
                if ((data.getShort(4) & 0xffff) != 0xa5e0 || data.getShort(6) != 12 || data.getShort(8) != width || data.getShort(10) != height || data.getShort(12) != 32)
                    throw new Refused("ART16_EDITABLE_DIMENSIONS_MISMATCH");
            }
        }
    }

    private static void verifyHead(HeadObjectResponse head, Asset asset) {
        if (!Objects.equals(head.contentLength(), asset.size()) || !asset.contentType().equals(head.contentType())
            || !asset.disposition().equals(head.contentDisposition()) || !CACHE.equals(head.cacheControl()) || !asset.checksum().equals(head.checksumSHA256())) throw new Refused("REMOTE_ASSET_METADATA_OR_CHECKSUM_MISMATCH");
    }

    static String validateImage(String path, byte[] bytes) throws Exception {
        if (path.endsWith(".png")) {
            byte[] signature = {(byte)137,80,78,71,13,10,26,10};
            if (bytes.length < 24 || !Arrays.equals(Arrays.copyOf(bytes, 8), signature)) throw new Refused("INVALID_PNG_SIGNATURE");
            var image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null || image.getWidth() < 1 || image.getHeight() < 1) throw new Refused("PNG_DECODE_FAILED");
            if (path.matches("images/imaginary-pixel-v1/C(?:0[1-9]|1[0-2])\\.png") && (image.getWidth() != 64 || image.getHeight() != 64)) throw new Refused("IMAGINARY_SPRITE_MUST_BE_64_BY_64");
            if (CUTE_PATHS.contains(path) && (image.getWidth() != 64 || image.getHeight() != 64)) throw new Refused("CUTE_SPRITE_MUST_BE_64_BY_64");
            if (PREMIUM_PATHS.contains(path) && (image.getWidth() < 512 || image.getHeight() < 512 || image.getWidth() > 4096 || image.getHeight() > 4096))
                throw new Refused("PREMIUM_MASTER_DIMENSIONS_OUT_OF_RANGE");
            if (PREMIUM_PATHS.contains(path) && (!image.getColorModel().hasAlpha() || bytes.length < 26 || bytes[25] != 6))
                throw new Refused("PREMIUM_MASTER_MUST_PRESERVE_RGBA");
            if (ART_DOG_PATHS.contains(path) && (image.getWidth() < 512 || image.getHeight() < 512 || image.getWidth() > 4096 || image.getHeight() > 4096))
                throw new Refused("ART_DOG_MASTER_DIMENSIONS_OUT_OF_RANGE");
            if (ART_DOG_PATHS.contains(path) && (!image.getColorModel().hasAlpha() || bytes.length < 26 || bytes[25] != 6))
                throw new Refused("ART_DOG_MASTER_MUST_PRESERVE_RGBA");
            if (ART16_PATHS.contains(path)) {
                int frames = path.endsWith("/walk.png") ? 8 : 1;
                if (image.getWidth() % frames != 0 || image.getWidth() / frames < 256 || image.getWidth() / frames > 4096
                    || image.getHeight() < 256 || image.getHeight() > 4096) throw new Refused("ART16_SCENE_DIMENSIONS_OUT_OF_RANGE");
                if (!image.getColorModel().hasAlpha() || bytes.length < 26 || bytes[25] != 6) throw new Refused("ART16_SCENE_MUST_PRESERVE_RGBA");
            }
            if (SOFT_PATHS.contains(path)) {
                if (image.getWidth() != 192 || image.getHeight() != 192) throw new Refused("SOFT_LAYER_MUST_BE_192_BY_192");
                if (!image.getColorModel().hasAlpha() || bytes.length < 26 || bytes[25] != 6) throw new Refused("SOFT_LAYER_MUST_PRESERVE_RGBA");
            }
            if (SP_PATHS.contains(path)) {
                int frames = path.endsWith("/walk.png") ? 8 : path.endsWith("/wag.png") ? 4 : 1;
                if (image.getWidth() % frames != 0 || image.getWidth() / frames < 192 || image.getWidth() / frames > 4096
                    || image.getHeight() < 192 || image.getHeight() > 4096) throw new Refused("SP_SCENE_DIMENSIONS_OUT_OF_RANGE");
                if (!image.getColorModel().hasAlpha() || bytes.length < 26 || bytes[25] != 6) throw new Refused("SP_SCENE_MUST_PRESERVE_RGBA");
            }
            return "image/png";
        }
        var factory = DocumentBuilderFactory.newInstance(); factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        var root = factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes)).getDocumentElement();
        if (!"svg".equals(root.getLocalName()) || !"http://www.w3.org/2000/svg".equals(root.getNamespaceURI())) throw new Refused("INVALID_SVG_ROOT");
        return "image/svg+xml";
    }

    private static String manifest(List<Asset> assets, String hash, String release, String prefix, String cdn, String originPath, long bytes) {
        StringBuilder json = new StringBuilder("{\n  \"manifestSha256\": ").append(quote(hash)).append(",\n  \"release\": ").append(quote(release))
            .append(",\n  \"keyBase\": ").append(quote(prefix)).append(",\n  \"cdnBase\": ").append(quote(cdn)).append(",\n  \"cdnOriginPath\": ").append(quote(originPath)).append(",\n  \"cacheControl\": ").append(quote(CACHE))
            .append(",\n  \"count\": ").append(assets.size()).append(",\n  \"totalBytes\": ").append(bytes).append(",\n  \"files\": [\n");
        for (int i = 0; i < assets.size(); i++) {
            var asset = assets.get(i);
            json.append("    {\"path\": ").append(quote(asset.path())).append(", \"key\": ").append(quote(prefix + "/" + asset.path()))
                .append(", \"contentType\": ").append(quote(asset.contentType())).append(", \"contentDisposition\": ").append(quote(asset.disposition())).append(", \"bytes\": ").append(asset.size())
                .append(", \"sha256\": ").append(quote(asset.sha256())).append("}").append(i + 1 == assets.size() ? "\n" : ",\n");
        }
        return json.append("  ]\n}\n").toString();
    }

    private static String sha(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    private static String required(String key) { String value = System.getenv(key); if (value == null || value.isBlank()) throw new Refused("REQUIRED_SETTING_MISSING"); return value.strip(); }
    private static String quote(String value) { return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t") + "\""; }
    private static final class Refused extends RuntimeException { final String code; Refused(String code) { this.code = code; } }
}
