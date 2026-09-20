import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;

/** Offline checks: no AWS client, environment credentials, existing artwork or release setting is used. */
public final class RubyRoundAssetPublisherTest {
    static int checks;
    interface Checked { void run() throws Exception; }
    static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    static void rejects(Checked action, String label) throws Exception { try { action.run(); } catch (RuntimeException e) { checks++; return; } throw new AssertionError(label); }
    static Map<String, Object> redrawnProof() {
        var proof = new LinkedHashMap<String, Object>();
        proof.put("version", 3); proof.put("breed", "pomeranian"); proof.put("width", 128); proof.put("height", 128);
        proof.put("frames", 64); proof.put("framesPerAction", 4); proof.put("eyeStyles", 30); proof.put("editableLayers", 31);
        proof.put("sourceKind", "independently-redrawn-64-frame-atlas"); proof.put("sourceSha256", "a".repeat(64)); proof.put("sourceInput", "source-input.png");
        proof.put("backgroundMode", "transparent-artifacts"); proof.put("fringeAlphaMax", 8);
        proof.put("reviewedFringeCleanup", Map.of("alphaMax", 8, "sourceSha256", "a".repeat(64), "connectivity", 8, "reason", "Reviewed source-specific fringe fixture"));
        proof.put("retainedArtworkRgbaUnchanged", true); proof.put("editableRgbaVerified", true); proof.put("bodyRegistration", "integer translation only");
        for (String flag : List.of("resized", "quantized", "fabricatedFrames", "derivedFromOldPoses", "mirroredFrames", "rotatedFrames")) proof.put(flag, false);
        proof.put("originalWidth", 1024); proof.put("originalHeight", 1024); proof.put("actionOrder", RubyRoundAssetPublisher.ACTIONS);
        List<Integer> cuts = new ArrayList<>(); for (int n = 0; n <= 8; n++) cuts.add(n * 128);
        proof.put("gridBoundaries", Map.of("y", cuts, "xByRow", Collections.nCopies(8, cuts)));
        var cells = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < 64; i++) cells.add(Map.of("index", i + 1, "action", RubyRoundAssetPublisher.ACTIONS.get(i / 4), "actionFrame", i % 4 + 1,
            "x", i % 8 * 128, "y", i / 8 * 128, "width", 128, "height", 128, "translation", Map.of("x", 0, "y", 0)));
        proof.put("cellRectangles", cells);
        var actions = new LinkedHashMap<String, Object>(); var scenes = new LinkedHashMap<String, Object>(); var hashes = new LinkedHashMap<String, Object>();
        for (String id : RubyRoundAssetPublisher.ACTIONS) { actions.put(id, Map.of()); hashes.put(id, "a".repeat(64)); }
        for (String id : RubyRoundAssetPublisher.SCENES) { scenes.put(id, Map.of()); hashes.put(id + "-default", "a".repeat(64)); hashes.put(id + "-desktop", "a".repeat(64)); }
        proof.put("actions", actions); proof.put("scenes", scenes); proof.put("pngSha256", hashes);
        return proof;
    }
    static tools.jackson.databind.JsonNode json(Object value) throws Exception {
        return RubyRoundAssetPublisher.JSON.readTree(RubyRoundAssetPublisher.JSON.writeValueAsString(value));
    }
    static Map<String, String> reviewedPanelHashes() {
        var hashes = new LinkedHashMap<String, String>();
        for (String panel : RubyRoundAssetPublisher.REVIEW_PANELS) hashes.put(panel, "d".repeat(64));
        return hashes;
    }
    static Map<String, Object> visualReview() {
        var review = new LinkedHashMap<String, Object>();
        review.put("breed", "pomeranian"); review.put("reviewComplete", true); review.put("reviewMethod", "manual-visual-inspection");
        review.put("reviewer", "manual QA fixture"); review.put("reviewedAtUtc", "2026-09-20T12:00:00Z");
        review.put("reviewedMasterSha256", "b".repeat(64)); review.put("reviewedSourceSha256", "c".repeat(64));
        review.put("sampledPanels", RubyRoundAssetPublisher.REVIEW_PANELS); review.put("reviewedPanelSha256", reviewedPanelHashes());
        review.put("belly", Map.of("status", "pass", "frameNumbers", List.of(35, 36), "observedPadsPerFrame", List.of(4, 4), "note", "Four distinct raised paws and supine torso inspected"));
        review.put("cyanCleanup", "Inspected eyes and closed expressions on all four panels");
        return review;
    }
    public static void main(String[] args) throws Exception {
        Path scope = Path.of(args[0]).toRealPath(), project = Path.of(args[1]).toRealPath(), work = Files.createTempDirectory(scope, "offline-check-");
        Set<String> paths = RubyRoundAssetPublisher.expectedPaths();
        check(paths.size() == 871, "Fixed exact base and motion pack size");
        check(paths.stream().filter(p -> p.endsWith(".png")).count() == 810, "Only 450 legacy scene variants, 330 action sheets and 30 eyes");
        check(paths.stream().filter(p -> p.endsWith(".aseprite")).count() == 61, "Only 30 legacy masters, 30 action masters and one common-eye master");
        check(paths.contains("images/ruby-round-v1/pomeranian/actions/typing.png")
            && paths.contains("images/ruby-round-v1/shiba/actions/walk-down.png")
            && paths.contains("downloads/ruby-round-v1/poodle-16-actions.aseprite"), "Reviewed action assets are in the finite allowlist");
        var actionContract = RubyRoundAssetPublisher.actionContract(project);
        check(actionContract.path("actions").size() == 16 && actionContract.path("framesPerAction").asInt() == 4,
            "Shared contract fixes sixteen actions with four frames each");
        Set<String> projectPaths = RubyRoundAssetPublisher.expectedPaths(project);
        Map<String, tools.jackson.databind.JsonNode> projectAccessories = RubyRoundAssetPublisher.accessoryAssets(project);
        check(projectPaths.containsAll(paths) && projectPaths.size() == paths.size() + projectAccessories.size()
            && projectPaths.containsAll(projectAccessories.keySet()), "Project pack is the immutable base plus every catalog image accessory");
        check(RubyRoundAssetPublisher.ACCESSORY_MAX_BYTES == 12L * 1024 * 1024, "Publisher and Windows share the accessory byte limit");
        Path catalogProject = Files.createDirectories(work.resolve("catalog-project")), shared = Files.createDirectories(catalogProject.resolve("shared"));
        Files.copy(project.resolve("shared/ruby-round-actions.json"), shared.resolve("ruby-round-actions.json"));
        String hash = "a".repeat(64), accessoryPath = "images/ruby-round-v1/accessories/round-glasses.png";
        Files.writeString(shared.resolve("accessories.json"), "{\"schemaVersion\":1,\"revision\":\"test-v1\",\"items\":[{\"id\":\"round-glasses\",\"renderer\":\"image\",\"asset\":{\"png\":\"/" + accessoryPath + "\",\"sha256\":\"" + hash + "\",\"width\":32,\"height\":16,\"pivotX\":16,\"pivotY\":8}}]}");
        Set<String> extended = RubyRoundAssetPublisher.expectedPaths(catalogProject.toRealPath());
        check(extended.size() == 872 && extended.contains(accessoryPath), "One reviewed accessory asset extends the finite path set once");
        Map<String, Object> releaseConfig = RubyRoundAssetPublisher.releaseConfig(catalogProject.toRealPath(), "release-1", "https://cdn.example/release-1");
        check(releaseConfig.get("accessoryCatalogRevision").equals("test-v1")
            && ((List<?>)releaseConfig.get("accessories")).size() == 1, "Activated frontend release records the exact accessory catalog");
        Files.writeString(shared.resolve("accessories.json"), "{\"schemaVersion\":1,\"revision\":\"test-v1\",\"items\":[{\"id\":\"round-glasses\",\"renderer\":\"image\",\"asset\":{\"png\":\"/private.png\",\"sha256\":\"" + hash + "\",\"width\":32,\"height\":16,\"pivotX\":16,\"pivotY\":8}}]}");
        rejects(() -> RubyRoundAssetPublisher.expectedPaths(catalogProject.toRealPath()), "Catalog cannot admit an arbitrary path");
        for (String rejected : List.of("downloads/PuppyRuby-server.jar", "downloads/PuppyRuby.exe", "images/pixel-garden.svg", ".env", "images/ruby-round-v1/../../private.png", "images/ruby-round-v1/unregistered/idle.png")) {
            check(!paths.contains(rejected), "Other files excluded before filesystem access");
            rejects(() -> RubyRoundAssetPublisher.inspect(work, rejected), "Unreviewed path is rejected");
        }
        Path png = work.resolve("fixture.png");
        BufferedImage image = new BufferedImage(32, 16, BufferedImage.TYPE_INT_ARGB); image.setRGB(5, 5, 0xff40302a); ImageIO.write(image, "png", png.toFile());
        RubyRoundAssetPublisher.validatePng(png, 32, 16); checks++;
        rejects(() -> RubyRoundAssetPublisher.validatePng(png, 128, 16), "Wrong sprite frame width rejected");
        rejects(() -> RubyRoundAssetPublisher.validatePng(png, 32, 32), "Wrong sprite height rejected");
        var digest = SiteDownloadPublisher.digest(png);
        RubyRoundAssetPublisher.verifyHash(digest.hex(), digest.hex().toUpperCase(Locale.ROOT)); checks++;
        rejects(() -> RubyRoundAssetPublisher.verifyHash(digest.hex(), "0".repeat(64)), "Changed asset does not match conversion proof");
        rejects(() -> RubyRoundAssetPublisher.verifyHash(digest.hex(), ""), "Missing conversion hash rejected");
        var asset = new SiteDownloadPublisher.Asset(png, "images/ruby-round-v1/eyes/eye-01.png", "image/png", "inline", digest.bytes(), digest.hex(), digest.base64());
        try (var body = Files.newInputStream(png)) { RubyRoundAssetPublisher.verifyBody(body, asset, "BAD_BYTES"); checks++; }
        byte[] altered = Files.readAllBytes(png); altered[altered.length - 1] ^= 1;
        rejects(() -> RubyRoundAssetPublisher.verifyBody(new ByteArrayInputStream(altered), asset, "BAD_BYTES"), "Full remote bytes must match, not metadata alone");
        rejects(() -> RubyRoundAssetPublisher.verifyBody(new ByteArrayInputStream(Arrays.copyOf(altered, altered.length - 1)), asset, "BAD_BYTES"), "Truncated body rejected");
        rejects(() -> RubyRoundAssetPublisher.verifyBody(new ByteArrayInputStream(Arrays.copyOf(altered, altered.length + 1)), asset, "BAD_BYTES"), "Oversized body rejected");
        String before = RubyRoundAssetPublisher.releaseHash(List.of(asset));
        check(before.equals(RubyRoundAssetPublisher.releaseHash(List.of(asset))), "Stable immutable release identity");
        var changedType = new SiteDownloadPublisher.Asset(png, asset.path(), "application/octet-stream", "inline", asset.size(), asset.sha256(), asset.checksum());
        check(!before.equals(RubyRoundAssetPublisher.releaseHash(List.of(changedType))), "Content metadata participates in release identity");
        Files.write(png, altered);
        rejects(() -> RubyRoundAssetPublisher.unchanged(asset), "Local edits after planning refuse upload");
        byte[] header = new byte[128]; var data = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        data.putInt(0, 128); data.putShort(4, (short)0xa5e0); data.putShort(6, (short)30); data.putShort(8, (short)32); data.putShort(10, (short)16); data.putShort(12, (short)32);
        Path aseprite = work.resolve("fixture.aseprite"); Files.write(aseprite, header);
        var ase = new SiteDownloadPublisher.Asset(aseprite, "downloads/ruby-round-v1/ruby-round-eyes.aseprite", "application/octet-stream", "attachment", 128, "", "");
        RubyRoundAssetPublisher.validateAseprite(ase, 32, 16, 30); checks++;
        rejects(() -> RubyRoundAssetPublisher.validateAseprite(ase, 32, 16, 20), "Wrong editable frame count rejected");
        rejects(() -> RubyRoundAssetPublisher.validateAseprite(ase, 300, 300, 30), "Resized editable master rejected");
        data.putShort(6, (short)64); Files.write(aseprite, header);
        RubyRoundAssetPublisher.validateAseprite(ase, 32, 16, 64); checks++;
        rejects(() -> RubyRoundAssetPublisher.validateAseprite(ase, 32, 16, 20), "A 64-frame action master cannot replace the 20-frame compatibility master");
        RubyRoundAssetPublisher.validateRedrawnProof(json(redrawnProof()), "pomeranian", 128, 128, 64); checks++;
        var reviewedLimit = redrawnProof(); reviewedLimit.put("fringeAlphaMax", 48);
        reviewedLimit.put("reviewedFringeCleanup", Map.of("alphaMax", 48, "sourceSha256", "a".repeat(64), "connectivity", 8, "reason", "Source-specific low-alpha gutter inspection"));
        RubyRoundAssetPublisher.validateRedrawnProof(json(reviewedLimit), "pomeranian", 128, 128, 64); checks++;
        var excessiveLimit = redrawnProof(); excessiveLimit.put("fringeAlphaMax", 49);
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(excessiveLimit), "pomeranian", 128, 128, 64), "Fringe cleanup beyond the reviewed cap is rejected");
        var unreviewedLimit = redrawnProof(); unreviewedLimit.put("fringeAlphaMax", 39);
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(unreviewedLimit), "pomeranian", 128, 128, 64), "Changing an alpha threshold without its source-specific review is rejected");
        var wrongReview = redrawnProof(); wrongReview.put("reviewedFringeCleanup", Map.of("alphaMax", 8, "sourceSha256", "b".repeat(64), "connectivity", 8, "reason", "A different source"));
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(wrongReview), "pomeranian", 128, 128, 64), "Cleanup review for another atlas is rejected");
        for (String flag : List.of("resized", "quantized", "fabricatedFrames", "derivedFromOldPoses", "mirroredFrames", "rotatedFrames")) {
            var invalid = redrawnProof(); invalid.put(flag, true);
            rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(invalid), "pomeranian", 128, 128, 64), "V3 rejects transformed or reused source: " + flag);
            var missing = redrawnProof(); missing.remove(flag);
            rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(missing), "pomeranian", 128, 128, 64), "Missing preservation flag cannot masquerade as false: " + flag);
        }
        for (var mutation : List.of(Map.entry("version", (Object)2), Map.entry("sourceKind", (Object)"derived-from-old-poses"),
            Map.entry("sourceSha256", (Object)""), Map.entry("sourceInput", (Object)"../../old.png"), Map.entry("frames", (Object)20),
            Map.entry("editableLayers", (Object)32), Map.entry("retainedArtworkRgbaUnchanged", (Object)false),
            Map.entry("backgroundMode", (Object)"erase-background"), Map.entry("fringeAlphaMax", (Object)255))) {
            var invalid = redrawnProof(); invalid.put(mutation.getKey(), mutation.getValue());
            rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(invalid), "pomeranian", 128, 128, 64), "Invalid v3 source contract rejected: " + mutation.getKey());
        }
        var repeated = redrawnProof(); var repeatedCells = new ArrayList<Object>((List<?>)repeated.get("cellRectangles")); repeatedCells.set(1, repeatedCells.get(0)); repeated.put("cellRectangles", repeatedCells);
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(repeated), "pomeranian", 128, 128, 64), "One source cell cannot impersonate a second drawn frame");
        var badGrid = redrawnProof(); badGrid.put("gridBoundaries", Map.of("y", List.of(0, 128, 128, 384, 512, 640, 768, 896, 1024), "xByRow", Collections.nCopies(8, List.of(0, 128, 256, 384, 512, 640, 768, 896, 1024))));
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(badGrid), "pomeranian", 128, 128, 64), "Overlapping or empty atlas rows rejected");
        var manualCells = redrawnProof(); manualCells.put("gridMode", "reviewed-source-rectangles"); manualCells.put("manualSourceCoverageVerified", true);
        manualCells.put("eyeAnchorsSha256", "a".repeat(64)); manualCells.put("gridBoundaries", Map.of("y", List.of(), "xByRow", List.of()));
        RubyRoundAssetPublisher.validateRedrawnProof(json(manualCells), "pomeranian", 128, 128, 64); checks++;
        for (String field : List.of("manualSourceCoverageVerified", "eyeAnchorsSha256")) {
            var invalid = new LinkedHashMap<>(manualCells); invalid.remove(field);
            rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(invalid), "pomeranian", 128, 128, 64), "Manual source rectangles require source-bound review: " + field);
        }
        var ambiguousLayout = new LinkedHashMap<>(manualCells); ambiguousLayout.put("gridBoundaries", redrawnProof().get("gridBoundaries"));
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(ambiguousLayout), "pomeranian", 128, 128, 64), "Reviewed rectangle layout cannot impersonate detected gutters");
        var repeatedManual = new LinkedHashMap<>(manualCells); repeatedManual.put("cellRectangles", repeatedCells);
        rejects(() -> RubyRoundAssetPublisher.validateRedrawnProof(json(repeatedManual), "pomeranian", 128, 128, 64), "Reviewed rectangles cannot reuse a source frame");
        var closedEyes = json(List.of(List.of(), List.of(), List.of(), List.of()));
        RubyRoundAssetPublisher.validateActionEyes(closedEyes, "closed", json(Collections.nCopies(4, "baked-closed")), 128, 128); checks++;
        RubyRoundAssetPublisher.validateActionEyes(closedEyes, "hidden", json(Collections.nCopies(4, "hidden")), 128, 128); checks++;
        rejects(() -> RubyRoundAssetPublisher.validateActionEyes(closedEyes, "shared", json(Collections.nCopies(4, "shared")), 128, 128), "Customizable eyes require real anchors");
        rejects(() -> RubyRoundAssetPublisher.validateActionEyes(closedEyes, "closed", json(Collections.nCopies(4, "unknown")), 128, 128), "Unknown frame eye modes rejected");
        rejects(() -> RubyRoundAssetPublisher.validateActionEyes(closedEyes, "closed", json(Collections.nCopies(3, "baked-closed")), 128, 128), "Missing frame eye mode rejected");
        RubyRoundAssetPublisher.validateVisualReview(json(visualReview()), "pomeranian", "b".repeat(64), "c".repeat(64), reviewedPanelHashes()); checks++;
        rejects(() -> RubyRoundAssetPublisher.validateVisualReview(null, "pomeranian", "b".repeat(64), "c".repeat(64), reviewedPanelHashes()), "Missing visual review cannot publish");
        for (var mutation : List.of(Map.entry("reviewComplete", (Object)false), Map.entry("reviewMethod", (Object)"automated-pixel-test"),
            Map.entry("reviewer", (Object)""), Map.entry("reviewedAtUtc", (Object)"invalid"), Map.entry("reviewedMasterSha256", (Object)"a".repeat(64)),
            Map.entry("reviewedSourceSha256", (Object)"a".repeat(64)), Map.entry("sampledPanels", (Object)List.of("actions9-12")),
            Map.entry("reviewedPanelSha256", (Object)Map.of()), Map.entry("cyanCleanup", (Object)""))) {
            var invalid = visualReview(); invalid.put(mutation.getKey(), mutation.getValue());
            rejects(() -> RubyRoundAssetPublisher.validateVisualReview(json(invalid), "pomeranian", "b".repeat(64), "c".repeat(64), reviewedPanelHashes()), "Incomplete or stale visual evidence rejected: " + mutation.getKey());
        }
        for (String status : List.of("fail", "pending")) {
            var invalid = visualReview(); invalid.put("belly", Map.of("status", status, "frameNumbers", List.of(35, 36), "observedPadsPerFrame", List.of(4, 4), "note", "Needs inspection"));
            rejects(() -> RubyRoundAssetPublisher.validateVisualReview(json(invalid), "pomeranian", "b".repeat(64), "c".repeat(64), reviewedPanelHashes()), "Unpassed belly anatomy cannot publish");
        }
        var fifthPad = visualReview(); fifthPad.put("belly", Map.of("status", "pass", "frameNumbers", List.of(35, 36), "observedPadsPerFrame", List.of(4, 5), "note", "Extra pad in final frame"));
        rejects(() -> RubyRoundAssetPublisher.validateVisualReview(json(fifthPad), "pomeranian", "b".repeat(64), "c".repeat(64), reviewedPanelHashes()), "A fifth pad cannot be waived by a pass boolean");
        var changedPanel = reviewedPanelHashes(); changedPanel.put("actions9-12", "e".repeat(64));
        rejects(() -> RubyRoundAssetPublisher.validateVisualReview(json(visualReview()), "pomeranian", "b".repeat(64), "c".repeat(64), changedPanel), "Changed preview invalidates manual review");
        System.out.println("PASS " + checks + " offline Ruby Round publisher checks: finite 871-path base pack, independently redrawn source proofs, 16-action contract, native masters, per-frame expressions, full remote body integrity and local-change refusal.");
    }
}
