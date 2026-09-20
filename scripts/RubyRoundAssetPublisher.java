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
    static final List<String> ACTIONS = List.of("idle", "side", "walk", "happy", "sleep", "typing", "petting", "eat", "belly",
        "stretch", "wag", "scratch", "walk-left", "walk-right", "walk-up", "walk-down");
    static final List<String> ADDON_ACTIONS = ACTIONS.subList(SCENES.size(), ACTIONS.size());
    static final List<String> REVIEW_PANELS = List.of("actions1-4", "actions5-8", "actions9-12", "actions13-16");
    static final String IMAGE = "images/ruby-round-v1/", DOWNLOAD = "downloads/ruby-round-v1/";
    static final int LEGACY_BASE_COUNT = 511, MOTION_BASE_COUNT = 30 * 12, BASE_COUNT = LEGACY_BASE_COUNT + MOTION_BASE_COUNT;
    static final int ACTION_FRAMES = 4, ACTION_MASTER_FRAMES = ACTIONS.size() * ACTION_FRAMES;
    static final long ACCESSORY_MAX_BYTES = 12L * 1024 * 1024;
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
        require(verified == assets.size(), "INCOMPLETE_REMOTE_VERIFICATION");
        require(hash.equals(releaseHash(inventory(project, root))), "LOCAL_PACK_CHANGED_DURING_PUBLISH");
        Files.writeString(output.resolve("verification.json"), JSON.writeValueAsString(Map.of("success", true, "release", release,
            "verifiedAt", Instant.now().toString(), "uploaded", uploaded, "existing", skipped, "s3BodyVerified", verified, "cdnBodyVerified", verified,
            "allFiles", assets.stream().map(SiteDownloadPublisher.Asset::path).toList())));
        phase = "activate-verified-pack";
        Path config = project.resolve("frontend/src/lib/generated/ruby-round-media-release.json");
        SiteDownloadPublisher.checkedPath(project, config.getParent());
        if (Files.exists(config)) SiteDownloadPublisher.checkedPath(project, config);
        Path temporary = Files.createTempFile(config.getParent(), "ruby-round-release-", ".tmp");
        Files.writeString(temporary, JSON.writeValueAsString(releaseConfig(project, release, cdn)) + "\n", StandardCharsets.UTF_8);
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
            for (String action : ADDON_ACTIONS) paths.add(IMAGE + breed + "/actions/" + action + ".png");
            paths.add(DOWNLOAD + breed + "-16-actions.aseprite");
        }
        for (int i = 1; i <= 30; i++) paths.add(IMAGE + "eyes/eye-%02d.png".formatted(i));
        paths.add(DOWNLOAD + "ruby-round-eyes.aseprite");
        require(paths.size() == BASE_COUNT, "PACK_REQUIRES_EXACTLY_871_BASE_FILES");
        return Collections.unmodifiableSet(paths);
    }

    /** The shared schema may describe metadata, but it cannot expand the publisher's fixed allowlist. */
    static JsonNode actionContract(Path project) throws Exception {
        Path source = project.resolve("shared/ruby-round-actions.json");
        SiteDownloadPublisher.checkedPath(project, source);
        JsonNode contract = JSON.readTree(Files.readString(source));
        require(contract.path("schemaVersion").asInt() == 2 && contract.path("framesPerAction").asInt() == ACTION_FRAMES
            && contract.path("actions").isArray() && contract.path("actions").size() == ACTIONS.size(), "INVALID_ACTION_CONTRACT");
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < ACTIONS.size(); i++) {
            JsonNode action = contract.path("actions").path(i);
            String id = action.path("id").asText(), kind = action.path("kind").asText(), sourceScene = action.path("source").asText();
            require(id.equals(ACTIONS.get(i)) && ids.add(id) && action.path("name").asText().length() >= 1
                && action.path("description").asText().length() >= 1 && action.path("frameMs").isIntegralNumber()
                && action.path("frameMs").asInt() >= 50 && action.path("frameMs").asInt() <= 2000
                && SCENES.contains(sourceScene) && Set.of("shared", "closed", "hidden", "baked").contains(action.path("eyeMode").asText())
                && kind.equals(i < SCENES.size() ? "legacy" : "derived"), "INVALID_ACTION_CONTRACT");
            if (i < SCENES.size()) require(sourceScene.equals(id), "LEGACY_ACTION_CONTRACT_CHANGED");
        }
        return contract;
    }

    /** Accessory images are admitted only when an explicit, validated catalog entry names them. */
    static Map<String, JsonNode> accessoryAssets(Path project) throws Exception {
        Path catalog = project.resolve("shared/accessories.json");
        SiteDownloadPublisher.checkedPath(project, catalog);
        JsonNode root = JSON.readTree(Files.readString(catalog));
        require(root.path("schemaVersion").asInt() == 1 && root.path("revision").asText().matches("[A-Za-z0-9._-]{1,80}")
            && root.path("items").isArray(), "INVALID_ACCESSORY_CATALOG");
        Map<String, JsonNode> assets = new TreeMap<>(); Set<String> ids = new HashSet<>();
        for (JsonNode item : root.path("items")) {
            String id = item.path("id").asText(), renderer = item.path("renderer").asText();
            require(id.length() <= 40 && id.matches("[a-z0-9]+(?:-[a-z0-9]+)*") && !id.equals("none") && ids.add(id), "INVALID_OR_DUPLICATE_ACCESSORY_ID");
            require(Set.of("builtin", "image").contains(renderer), "INVALID_ACCESSORY_RENDERER");
            if (!renderer.equals("image")) { require(item.path("asset").isMissingNode(), "BUILTIN_ACCESSORY_MUST_NOT_HAVE_ASSET"); continue; }
            JsonNode asset = item.path("asset"); String png = asset.path("png").asText();
            require(png.equals("/" + IMAGE + "accessories/" + id + ".png") && asset.path("sha256").asText().matches("[a-f0-9]{64}")
                && asset.path("width").asInt() >= 1 && asset.path("width").asInt() <= 2048
                && asset.path("height").asInt() >= 1 && asset.path("height").asInt() <= 2048
                && asset.path("pivotX").isNumber() && asset.path("pivotY").isNumber()
                && asset.path("pivotX").asDouble() >= 0 && asset.path("pivotX").asDouble() <= asset.path("width").asInt()
                && asset.path("pivotY").asDouble() >= 0 && asset.path("pivotY").asDouble() <= asset.path("height").asInt(), "INVALID_ACCESSORY_ASSET");
            require(assets.put(png.substring(1), asset) == null, "DUPLICATE_ACCESSORY_ASSET_PATH");
        }
        return Collections.unmodifiableMap(assets);
    }

    static Set<String> expectedPaths(Path project) throws Exception {
        actionContract(project);
        Map<String, JsonNode> accessories = accessoryAssets(project);
        Set<String> paths = new TreeSet<>(expectedPaths()); paths.addAll(accessories.keySet());
        require(paths.size() == BASE_COUNT + accessories.size(), "ACCESSORY_PATH_SET_MISMATCH");
        return Collections.unmodifiableSet(paths);
    }

    static Map<String, Object> releaseConfig(Path project, String release, String cdn) throws Exception {
        JsonNode catalog = JSON.readTree(Files.readString(project.resolve("shared/accessories.json")));
        Map<String, JsonNode> images = accessoryAssets(project);
        List<Map<String, Object>> accessories = new ArrayList<>();
        for (var entry : images.entrySet()) {
            String path = entry.getKey(), id = Path.of(path).getFileName().toString().replaceFirst("\\.png$", "");
            JsonNode asset = entry.getValue();
            accessories.add(Map.of("id", id, "png", "/" + path, "sha256", asset.path("sha256").asText(),
                "width", asset.path("width").asInt(), "height", asset.path("height").asInt()));
        }
        var value = new LinkedHashMap<String, Object>();
        value.put("release", release); value.put("baseUrl", cdn);
        value.put("accessoryCatalogRevision", catalog.path("revision").asText()); value.put("accessories", accessories);
        return Collections.unmodifiableMap(value);
    }

    static List<SiteDownloadPublisher.Asset> inventory(Path project, Path root) throws Exception {
        var assets = new ArrayList<SiteDownloadPublisher.Asset>();
        Set<String> expected = expectedPaths(project);
        JsonNode contract = actionContract(project);
        Path catalog = project.resolve("frontend/src/lib/generated/ruby-round-scene-assets.json");
        SiteDownloadPublisher.checkedPath(project, catalog);
        JsonNode manifest = JSON.readTree(Files.readString(catalog));
        require(manifest.isArray() && manifest.size() == 30, "ALL_30_BREEDS_MUST_BE_COMPLETE");
        Map<String, JsonNode> entries = new HashMap<>();
        Set<Integer> assetVersions = new HashSet<>();
        for (JsonNode entry : manifest) {
            String breed = entry.path("breed").asText();
            require(BreedCatalog.IDS.contains(breed) && entries.put(breed, entry) == null, "INVALID_OR_DUPLICATE_BREED");
            int version = entry.path("assetVersion").asInt(2);
            require(version == 2 || version == 3, "UNSUPPORTED_ASSET_VERSION");
            assetVersions.add(version);
        }
        require(assetVersions.size() == 1, "MIXED_REDRAW_GENERATIONS");
        Map<String, JsonNode> visualReviews = assetVersions.contains(3) ? visualReviewRecords(project) : Map.of();
        if (assetVersions.contains(3)) verifyRedrawnPixels(project);
        Set<String> redrawnSources = new HashSet<>();
        for (String breed : BreedCatalog.IDS) {
            JsonNode entry = entries.get(breed);
            require(entry != null, "REGISTERED_BREED_MISSING");
            int width = entry.path("width").asInt(), height = entry.path("height").asInt();
            require(width >= 96 && width <= 2048 && height >= 96 && height <= 2048, "INVALID_NATIVE_CANVAS");
            if (entry.path("assetVersion").asInt() == 3) {
                inventoryRedrawnBreed(project, root, expected, contract, entry, breed, width, height, assets, redrawnSources, visualReviews.get(breed));
                continue;
            }
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

            Path motionProofPath = project.resolve("local-assets/work/ruby-round-v2/processed/" + breed + "/motion-conversion.json");
            SiteDownloadPublisher.checkedPath(project, motionProofPath);
            JsonNode motionProof = JSON.readTree(Files.readString(motionProofPath));
            require(breed.equals(motionProof.path("breed").asText()) && motionProof.path("version").asInt() == 2
                && motionProof.path("frames").asInt() == ACTION_MASTER_FRAMES && motionProof.path("framesPerAction").asInt() == ACTION_FRAMES
                && motionProof.path("eyeStyles").asInt() == 30 && motionProof.path("editableLayers").asInt() == 32
                && motionProof.path("width").asInt() == width && motionProof.path("height").asInt() == height
                && motionProof.path("integerMotionOnly").asBoolean() && motionProof.path("legacyFramesPreserved").asBoolean()
                && !motionProof.path("resized").asBoolean() && !motionProof.path("quantized").asBoolean()
                && motionProof.path("actions").isObject() && motionProof.path("actions").size() == ACTIONS.size()
                && motionProof.path("pngSha256").isObject() && motionProof.path("pngSha256").size() == ADDON_ACTIONS.size(), "MOTION_PROOF_MISMATCH");
            require(entry.path("motionAseprite").equals(motionProof.path("aseprite"))
                && entry.path("actions").equals(motionProof.path("actions")), "MOTION_MANIFEST_MISMATCH");
            require(motionProof.path("actionOrder").isArray() && motionProof.path("actionOrder").size() == ACTIONS.size(), "ACTION_ORDER_MISMATCH");
            for (int i = 0; i < ACTIONS.size(); i++)
                require(motionProof.path("actionOrder").path(i).asText().equals(ACTIONS.get(i)), "ACTION_ORDER_MISMATCH");

            Path sourceMaster = project.resolve("local-assets/work/ruby-round-v1/processed/" + breed + "/" + breed + ".aseprite");
            SiteDownloadPublisher.checkedPath(project, sourceMaster);
            verifyHash(SiteDownloadPublisher.digest(sourceMaster).hex(), motionProof.path("sourceAsepriteSha256").asText());
            verifyHash(proof.path("asepriteSha256").asText(), motionProof.path("sourceAsepriteSha256").asText());
            verifyHash(SiteDownloadPublisher.digest(proofPath).hex(), motionProof.path("sourceProofSha256").asText());
            require(motionProof.path("sourceAseprite").asText().equals("/" + DOWNLOAD + breed + ".aseprite"), "MOTION_SOURCE_PATH_MISMATCH");

            for (int i = 0; i < ACTIONS.size(); i++) {
                String actionId = ACTIONS.get(i); JsonNode spec = contract.path("actions").path(i), action = motionProof.path("actions").path(actionId);
                require(action.path("id").asText().equals(actionId) && action.path("name").asText().equals(spec.path("name").asText())
                    && action.path("description").asText().equals(spec.path("description").asText())
                    && action.path("frames").asInt() == ACTION_FRAMES && action.path("frameMs").asInt() == spec.path("frameMs").asInt()
                    && action.path("source").asText().equals(spec.path("source").asText()) && action.path("kind").asText().equals(spec.path("kind").asText())
                    && action.path("eyeMode").asText().equals(spec.path("eyeMode").asText()), "ACTION_METADATA_MISMATCH");
                validateActionEyes(action.path("eyes"), action.path("eyeMode").asText(), width, height);
                if (i < SCENES.size()) {
                    JsonNode legacy = entry.path("scenes").path(actionId);
                    require(action.path("png").asText().equals("/" + IMAGE + breed + "/" + actionId + ".png")
                        && action.path("png").equals(legacy.path("png")) && action.path("frameMs").equals(legacy.path("frameMs"))
                        && action.path("eyes").equals(legacy.path("eyes")), "LEGACY_ACTION_CHANGED");
                    continue;
                }
                String actionRelative = IMAGE + breed + "/actions/" + actionId + ".png";
                require(action.path("png").asText().equals("/" + actionRelative), "ACTION_PATH_MISMATCH");
                var actionSheet = inspect(root, actionRelative, expected);
                validatePng(actionSheet.source(), width * ACTION_FRAMES, height);
                verifyHash(actionSheet.sha256(), motionProof.path("pngSha256").path(actionId).asText());
                assets.add(actionSheet);
            }
            String motionRelative = DOWNLOAD + breed + "-16-actions.aseprite";
            require(motionProof.path("aseprite").asText().equals("/" + motionRelative), "MOTION_ASEPRITE_PATH_MISMATCH");
            var motionMaster = inspect(root, motionRelative, expected);
            validateAseprite(motionMaster, width, height, ACTION_MASTER_FRAMES);
            verifyHash(motionMaster.sha256(), motionProof.path("asepriteSha256").asText());
            assets.add(motionMaster);
        }
        Set<String> eyeHashes = new HashSet<>();
        for (int i = 1; i <= 30; i++) {
            var eye = inspect(root, IMAGE + "eyes/eye-%02d.png".formatted(i)); validatePng(eye.source(), 32, 16);
            require(eyeHashes.add(eye.sha256()), "COMMON_EYES_MUST_HAVE_30_DISTINCT_SPRITES"); assets.add(eye);
        }
        var master = inspect(root, DOWNLOAD + "ruby-round-eyes.aseprite"); validateAseprite(master, 32, 16, 30); assets.add(master);
        for (var entry : accessoryAssets(project).entrySet()) {
            JsonNode definition = entry.getValue(); var accessory = inspect(root, entry.getKey(), expected);
            require(accessory.size() <= ACCESSORY_MAX_BYTES, "ACCESSORY_ASSET_SIZE_INVALID");
            validatePng(accessory.source(), definition.path("width").asInt(), definition.path("height").asInt());
            verifyHash(accessory.sha256(), definition.path("sha256").asText()); assets.add(accessory);
        }
        require(new HashSet<>(assets.stream().map(SiteDownloadPublisher.Asset::path).toList()).equals(expected) && assets.size() == expected.size(), "PACK_PATH_SET_MISMATCH");
        require(assets.stream().mapToLong(SiteDownloadPublisher.Asset::size).sum() <= 1024L * 1024 * 1024, "PACK_TOO_LARGE");
        assets.sort(Comparator.comparing(SiteDownloadPublisher.Asset::path));
        return List.copyOf(assets);
    }

    static void validateRedrawnProof(JsonNode proof, String breed, int width, int height, int frames) {
        require(proof.path("version").asInt() == 3 && proof.path("breed").asText().equals(breed)
            && proof.path("sourceKind").asText().equals("independently-redrawn-64-frame-atlas")
            && proof.path("sourceSha256").asText().matches("(?i)[a-f0-9]{64}")
            && proof.path("sourceInput").asText().equals("source-input.png")
            && proof.path("frames").asInt() == frames && proof.path("framesPerAction").asInt() == 4
            && proof.path("width").asInt() == width && proof.path("height").asInt() == height
            && proof.path("eyeStyles").asInt() == 30 && proof.path("editableLayers").asInt() == 31
            && proof.path("retainedArtworkRgbaUnchanged").asBoolean() && proof.path("editableRgbaVerified").asBoolean(), "REDRAW_PROOF_MISMATCH");
        for (String field : List.of("resized", "quantized", "fabricatedFrames", "derivedFromOldPoses", "mirroredFrames", "rotatedFrames"))
            require(proof.path(field).isBoolean() && !proof.path(field).asBoolean(), "REDRAW_USES_SYNTHETIC_POSES");
        require(Set.of("transparent", "border-magenta", "transparent-artifacts").contains(proof.path("backgroundMode").asText()), "REDRAW_CLEANUP_MODE_INVALID");
        if (proof.path("backgroundMode").asText().equals("transparent-artifacts")) {
            require(proof.path("fringeAlphaMax").isIntegralNumber() && proof.path("fringeAlphaMax").asInt() >= 1
                && proof.path("fringeAlphaMax").asInt() <= 48, "REDRAW_CLEANUP_THRESHOLD_INVALID");
            JsonNode review = proof.path("reviewedFringeCleanup");
            require(review.path("alphaMax").equals(proof.path("fringeAlphaMax")) && review.path("sourceSha256").equals(proof.path("sourceSha256"))
                && review.path("connectivity").asInt() == 8 && !review.path("reason").asText().isBlank(), "REDRAW_CLEANUP_REVIEW_MISMATCH");
        }
        require(proof.path("bodyRegistration").asText().equals("integer translation only")
            && proof.path("actions").isObject() && proof.path("actions").size() == 16
            && proof.path("scenes").isObject() && proof.path("scenes").size() == 5
            && proof.path("pngSha256").isObject() && proof.path("pngSha256").size() == 26
            && proof.path("actionOrder").isArray() && proof.path("actionOrder").size() == 16
            && proof.path("cellRectangles").isArray() && proof.path("cellRectangles").size() == 64, "REDRAW_SOURCE_LAYOUT_MISMATCH");
        int originalWidth = proof.path("originalWidth").asInt(), originalHeight = proof.path("originalHeight").asInt();
        require(originalWidth >= 512 && originalHeight >= 512 && originalWidth <= 32768 && originalHeight <= 32768, "REDRAW_SOURCE_LAYOUT_MISMATCH");
        JsonNode yCuts = proof.path("gridBoundaries").path("y"), xRows = proof.path("gridBoundaries").path("xByRow");
        boolean reviewedCells = proof.path("gridMode").asText().equals("reviewed-source-rectangles");
        require(!proof.has("gridMode") || reviewedCells || proof.path("gridMode").asText().equals("detected-gutters"), "REDRAW_SOURCE_LAYOUT_MISMATCH");
        if (reviewedCells) require(proof.path("manualSourceCoverageVerified").isBoolean() && proof.path("manualSourceCoverageVerified").asBoolean()
            && proof.path("eyeAnchorsSha256").asText().matches("(?i)[a-f0-9]{64}") && yCuts.isArray() && yCuts.isEmpty()
            && xRows.isArray() && xRows.isEmpty(), "REDRAW_MANUAL_RECTANGLES_REQUIRE_REVIEW");
        else require(yCuts.isArray() && yCuts.size() == 9 && xRows.isArray() && xRows.size() == 8
            && yCuts.path(0).asInt(-1) == 0 && yCuts.path(8).asInt() == originalHeight, "REDRAW_SOURCE_LAYOUT_MISMATCH");
        Set<String> sourceRectangles = new HashSet<>();
        for (int row = 0; row < 8; row++) {
            JsonNode xCuts = xRows.path(row);
            if (!reviewedCells) require(xCuts.isArray() && xCuts.size() == 9 && xCuts.path(0).asInt(-1) == 0 && xCuts.path(8).asInt() == originalWidth
                && yCuts.path(row).isIntegralNumber() && yCuts.path(row + 1).asInt() > yCuts.path(row).asInt(), "REDRAW_SOURCE_LAYOUT_MISMATCH");
            for (int col = 0; col < 8; col++) {
                int i = row * 8 + col; JsonNode cell = proof.path("cellRectangles").path(i);
                for (String field : List.of("index", "actionFrame", "x", "y", "width", "height")) require(cell.path(field).isIntegralNumber(), "REDRAW_SOURCE_CELL_MISMATCH");
                int x = cell.path("x").asInt(), y = cell.path("y").asInt(), w = cell.path("width").asInt(), h = cell.path("height").asInt();
                require(cell.path("index").asInt() == i + 1 && cell.path("action").asText().equals(ACTIONS.get(i / 4))
                    && cell.path("actionFrame").asInt() == i % 4 + 1
                    && x >= 0 && y >= 0 && w >= 64 && h >= 64 && w <= width && h <= height && x + w <= originalWidth && y + h <= originalHeight
                    && sourceRectangles.add(x + ":" + y + ":" + w + ":" + h)
                    && cell.path("translation").path("x").isIntegralNumber() && cell.path("translation").path("y").isIntegralNumber(), "REDRAW_SOURCE_CELL_MISMATCH");
                if (!reviewedCells) require(xCuts.path(col).isIntegralNumber() && xCuts.path(col + 1).asInt() > xCuts.path(col).asInt()
                    && x == xCuts.path(col).asInt() && y == yCuts.path(row).asInt()
                    && w == xCuts.path(col + 1).asInt() - xCuts.path(col).asInt()
                    && h == yCuts.path(row + 1).asInt() - yCuts.path(row).asInt(), "REDRAW_SOURCE_CELL_MISMATCH");
            }
        }
        for (int i = 0; i < ACTIONS.size(); i++) require(proof.path("actionOrder").path(i).asText().equals(ACTIONS.get(i)), "ACTION_ORDER_MISMATCH");
    }

    /** Recheck source pixels at publication time as well as during registration. */
    static void verifyRedrawnPixels(Path project) throws Exception {
        Path verifier = project.resolve("scripts/verify-ruby-round-action-assets.cjs");
        SiteDownloadPublisher.checkedPath(project, verifier);
        Process process = new ProcessBuilder("node", verifier.toString(), "--source-version=v3", "--staged", "--require-visual-review")
            .directory(project.toFile()).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        boolean completed = process.waitFor(10, java.util.concurrent.TimeUnit.MINUTES);
        if (!completed) process.destroyForcibly();
        require(completed && process.exitValue() == 0, "REDRAW_PIXEL_VERIFICATION_FAILED");
    }

    static Map<String, JsonNode> visualReviewRecords(Path project) throws Exception {
        Path source = project.resolve("local-assets/work/ruby-round-v3/review/visual-review.json");
        SiteDownloadPublisher.checkedPath(project, source);
        JsonNode document = JSON.readTree(Files.readString(source));
        require(document.path("version").asInt() == 1 && document.path("reviews").isArray()
            && document.path("reviews").size() == BreedCatalog.IDS.size(), "ALL_30_VISUAL_REVIEWS_REQUIRED");
        var result = new HashMap<String, JsonNode>();
        for (JsonNode review : document.path("reviews")) {
            String breed = review.path("breed").asText();
            require(BreedCatalog.IDS.contains(breed) && result.put(breed, review) == null, "INVALID_VISUAL_REVIEW_BREED");
        }
        return result;
    }

    static void validateVisualReview(JsonNode review, String breed, String masterSha, String sourceSha, Map<String, String> panelHashes) {
        require(review != null && review.path("breed").asText().equals(breed) && review.path("reviewComplete").isBoolean()
            && review.path("reviewComplete").asBoolean() && review.path("reviewMethod").asText().equals("manual-visual-inspection")
            && !review.path("reviewer").asText().isBlank(), "MANUAL_VISUAL_REVIEW_REQUIRED");
        try { Instant.parse(review.path("reviewedAtUtc").asText()); }
        catch (RuntimeException error) { throw new Refused("VISUAL_REVIEW_TIME_REQUIRED"); }
        verifyHash(masterSha, review.path("reviewedMasterSha256").asText());
        verifyHash(sourceSha, review.path("reviewedSourceSha256").asText());
        require(review.path("sampledPanels").isArray() && review.path("sampledPanels").size() == REVIEW_PANELS.size()
            && review.path("reviewedPanelSha256").isObject() && review.path("reviewedPanelSha256").size() == REVIEW_PANELS.size(), "ALL_ACTION_PANELS_MUST_BE_REVIEWED");
        for (int i = 0; i < REVIEW_PANELS.size(); i++) {
            String panel = REVIEW_PANELS.get(i);
            require(review.path("sampledPanels").path(i).asText().equals(panel) && panelHashes.containsKey(panel), "ALL_ACTION_PANELS_MUST_BE_REVIEWED");
            verifyHash(panelHashes.get(panel), review.path("reviewedPanelSha256").path(panel).asText());
        }
        JsonNode belly = review.path("belly");
        require(belly.path("status").asText().equals("pass") && belly.path("frameNumbers").isArray() && belly.path("frameNumbers").size() == 2
            && belly.path("observedPadsPerFrame").isArray() && belly.path("observedPadsPerFrame").size() == 2
            && !belly.path("note").asText().isBlank() && !review.path("cyanCleanup").asText().isBlank(), "BELLY_AND_FACE_OBSERVATIONS_REQUIRED");
        for (int i = 0; i < 2; i++) require(belly.path("frameNumbers").path(i).isIntegralNumber() && belly.path("frameNumbers").path(i).asInt() == 35 + i
            && belly.path("observedPadsPerFrame").path(i).isIntegralNumber() && belly.path("observedPadsPerFrame").path(i).asInt() == 4, "FOUR_VISIBLE_PAW_PADS_MUST_BE_REVIEWED");
    }

    static void inventoryRedrawnBreed(Path project, Path root, Set<String> expected, JsonNode contract, JsonNode entry,
        String breed, int width, int height, List<SiteDownloadPublisher.Asset> assets, Set<String> sources, JsonNode visualReview) throws Exception {
        Path directory = project.resolve("local-assets/work/ruby-round-v3/processed/" + breed);
        Path proofPath = directory.resolve("motion-conversion.json"), corePath = directory.resolve("conversion.json");
        SiteDownloadPublisher.checkedPath(project, proofPath); SiteDownloadPublisher.checkedPath(project, corePath);
        JsonNode proof = JSON.readTree(Files.readString(proofPath)), core = JSON.readTree(Files.readString(corePath));
        validateRedrawnProof(proof, breed, width, height, 64); validateRedrawnProof(core, breed, width, height, 20);
        var panelHashes = new LinkedHashMap<String, String>();
        for (String panel : REVIEW_PANELS) {
            Path panelFile = project.resolve("local-assets/work/ruby-round-v3/review/" + breed + "-" + panel.replace("actions", "actions-") + ".png");
            SiteDownloadPublisher.checkedPath(project, panelFile); panelHashes.put(panel, SiteDownloadPublisher.digest(panelFile).hex());
        }
        Path actualMaster = directory.resolve(breed + "-16-actions.aseprite"); SiteDownloadPublisher.checkedPath(project, actualMaster);
        validateVisualReview(visualReview, breed, SiteDownloadPublisher.digest(actualMaster).hex(), proof.path("sourceSha256").asText(), panelHashes);
        require(proof.path("sourceSha256").equals(core.path("sourceSha256")) && proof.path("cellRectangles").equals(core.path("cellRectangles"))
            && proof.path("actions").equals(core.path("actions")) && proof.path("scenes").equals(core.path("scenes"))
            && entry.path("scenes").equals(proof.path("scenes")) && entry.path("actions").equals(proof.path("actions")), "REDRAW_MANIFEST_MISMATCH");
        require(sources.add(proof.path("sourceSha256").asText().toLowerCase(Locale.ROOT)), "REDRAW_SOURCE_REUSED_ACROSS_BREEDS");
        for (Path original : List.of(project.resolve("local-assets/work/ruby-round-v3/originals/" + breed + ".png"), directory.resolve("source-input.png"))) {
            SiteDownloadPublisher.checkedPath(project, original);
            verifyHash(SiteDownloadPublisher.digest(original).hex(), proof.path("sourceSha256").asText());
        }
        for (int i = 0; i < ACTIONS.size(); i++) {
            String id = ACTIONS.get(i); JsonNode action = proof.path("actions").path(id), definition = contract.path("actions").path(i);
            String relative = IMAGE + breed + "/" + (i < 5 ? "" : "actions/") + id + ".png";
            require(action.path("id").asText().equals(id) && action.path("kind").asText().equals("redrawn")
                && action.path("source").asText().equals("independently-redrawn-atlas")
                && action.path("name").equals(definition.path("name")) && action.path("description").equals(definition.path("description"))
                && action.path("frames").asInt() == 4 && action.path("frameMs").equals(definition.path("frameMs"))
                && action.path("png").asText().equals("/" + relative)
                && action.path("eyeModeByFrame").isArray() && action.path("eyeModeByFrame").size() == 4, "REDRAW_ACTION_MISMATCH");
            validateActionEyes(action.path("eyes"), action.path("eyeMode").asText(), action.path("eyeModeByFrame"), width, height);
            var sheet = inspect(root, relative, expected); validatePng(sheet.source(), width * 4, height);
            verifyHash(sheet.sha256(), proof.path("pngSha256").path(id).asText()); assets.add(sheet);
            if (i < 5) {
                JsonNode scene = proof.path("scenes").path(id);
                require(scene.path("png").equals(action.path("png")) && scene.path("frames").asInt() == 4
                    && scene.path("frameMs").equals(action.path("frameMs")) && scene.path("eyes").equals(action.path("eyes"))
                    && scene.path("eyeModeByFrame").equals(action.path("eyeModeByFrame"))
                    && scene.path("desktopPng").asText().equals("/" + IMAGE + breed + "/" + id + "-desktop.png")
                    && scene.path("desktopFrames").asInt() == (id.equals("walk") ? 4 : 1), "REDRAW_COMPATIBILITY_SCENE_MISMATCH");
                for (String suffix : List.of("-default", "-desktop")) {
                    var image = inspect(root, IMAGE + breed + "/" + id + suffix + ".png", expected);
                    validatePng(image.source(), width * (suffix.equals("-desktop") && !id.equals("walk") ? 1 : 4), height);
                    verifyHash(image.sha256(), proof.path("pngSha256").path(id + suffix).asText()); assets.add(image);
                }
            }
        }
        for (boolean motion : List.of(false, true)) {
            String relative = DOWNLOAD + breed + (motion ? "-16-actions" : "") + ".aseprite";
            JsonNode spec = motion ? proof : core;
            require(spec.path("aseprite").asText().equals("/" + relative)
                && entry.path(motion ? "motionAseprite" : "aseprite").equals(spec.path("aseprite")), "REDRAW_MASTER_PATH_MISMATCH");
            var master = inspect(root, relative, expected); validateAseprite(master, width, height, motion ? 64 : 20);
            verifyHash(master.sha256(), spec.path("asepriteSha256").asText()); assets.add(master);
        }
        verifyHash(core.path("asepriteSha256").asText(), proof.path("legacyAsepriteSha256").asText());
        verifyHash(proof.path("asepriteSha256").asText(), core.path("motionAsepriteSha256").asText());
    }

    static void validateActionEyes(JsonNode frames, String eyeMode, int width, int height) {
        validateActionEyes(frames, eyeMode, null, width, height);
    }
    static void validateActionEyes(JsonNode frames, String eyeMode, JsonNode modes, int width, int height) {
        require(frames.isArray() && frames.size() == ACTION_FRAMES, "ACTION_EYE_LAYOUT_MISMATCH");
        boolean perFrame = modes != null && !modes.isMissingNode() && !modes.isNull();
        require(Set.of("shared", "closed", "hidden", "baked").contains(eyeMode)
            && (!perFrame || modes.isArray() && modes.size() == ACTION_FRAMES), "ACTION_EYE_LAYOUT_MISMATCH");
        int frame = 0;
        for (JsonNode anchors : frames) {
            String mode = perFrame ? modes.path(frame++).asText() : eyeMode;
            if (perFrame) require(Set.of("shared", "baked-closed", "hidden").contains(mode), "ACTION_EYE_MODE_MISMATCH");
            boolean hidden = Set.of("hidden", "baked", "baked-closed").contains(mode);
            require(anchors.isArray() && (hidden ? anchors.isEmpty() : anchors.size() >= 1 && anchors.size() <= 2), "ACTION_EYE_LAYOUT_MISMATCH");
            for (JsonNode anchor : anchors) {
                int x = anchor.path("x").asInt(-1), y = anchor.path("y").asInt(-1), w = anchor.path("width").asInt(-1), h = anchor.path("height").asInt(-1);
                require(anchor.path("x").isIntegralNumber() && anchor.path("y").isIntegralNumber()
                    && anchor.path("width").isIntegralNumber() && anchor.path("height").isIntegralNumber()
                    && x >= 0 && y >= 0 && w >= 16 && h >= 16 && w % 16 == 0 && h % 16 == 0
                    && x + w <= width && y + h <= height, "ACTION_EYE_LAYOUT_MISMATCH");
            }
        }
    }

    static SiteDownloadPublisher.Asset inspect(Path root, String relative) throws Exception {
        return inspect(root, relative, expectedPaths());
    }
    static SiteDownloadPublisher.Asset inspect(Path root, String relative, Set<String> expected) throws Exception {
        require(expected.contains(relative), "UNREVIEWED_PACK_PATH"); current = relative;
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
