import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import javax.imageio.ImageIO;
import com.puppyruby.game.BreedCatalog;
import tools.jackson.databind.ObjectMapper;

/** Offline inventory guards: incomplete sprite exports cannot become a CDN release. */
public final class SiteAssetPublisherTest {
    private static int checks;
    @FunctionalInterface interface Checked { void run() throws Exception; }
    private static void check(boolean condition) { if (!condition) throw new AssertionError(); checks++; }
    private static void rejected(Checked action) throws Exception {
        try { action.run(); } catch (RuntimeException expected) { checks++; return; }
        throw new AssertionError("Unsafe inventory was accepted");
    }
    private static byte[] png(int width, int height) throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "png", bytes);
        return bytes.toByteArray();
    }
    public static void main(String[] args) throws Exception {
        Set<String> prior = new HashSet<>(Set.of("images/puppies.png", "images/pixel-garden.svg", "favicon.svg", "images/pixel-art-v1/art-30.png"));
        check(SiteAssetPublisher.cdnSamplesFor(prior).size() == 4);
        for (int i = 1; i <= 12; i++) prior.add("images/imaginary-pixel-v1/C%02d.png".formatted(i));
        check(SiteAssetPublisher.cdnSamplesFor(prior).size() == 6);
        var complete = new HashSet<>(prior);
        var cute = new ArrayList<String>();
        for (String family : List.of("cozy", "bean", "bright", "button")) for (String body : List.of("chubby", "slim", "tall", "loaf")) {
            String path = "images/cute-puppies-v1/" + family + "-" + body + ".png";
            cute.add(path); complete.add(path);
            check("image/png".equals(SiteAssetPublisher.validateImage(path, png(64, 64))));
            rejected(() -> SiteAssetPublisher.validateImage(path, png(512, 512)));
            rejected(() -> SiteAssetPublisher.validateImage(path, png(64, 63)));
        }
        var checksums = SiteAssetPublisher.cdnSamplesFor(complete);
        check(checksums.size() == 22 && checksums.containsAll(cute));
        for (String path : cute) {
            var incomplete = new HashSet<>(complete); incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        var withPreview = new HashSet<>(complete); withPreview.add("images/cute-puppies-v1/cozy-chubby-preview.png");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(withPreview));
        var missingOld = new HashSet<>(complete); missingOld.remove("favicon.svg");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(missingOld));
        var premium = new ArrayList<String>();
        for (String name : List.of("marshmallow", "milkbean", "honeybun", "cloudpuff", "biscuit", "naploaf",
            "teddycub", "peachcheek", "buttonpaw", "rounddrop", "cottonball", "caramel")) {
            String path = "images/premium-puppies-v1/premium-" + name + ".png";
            premium.add(path); complete.add(path);
            check("image/png".equals(SiteAssetPublisher.validateImage(path, png(1024, 1024))));
            rejected(() -> SiteAssetPublisher.validateImage(path, png(64, 64)));
        }
        check(SiteAssetPublisher.cdnSamplesFor(complete).size() == 34);
        check(SiteAssetPublisher.cdnSamplesFor(complete).containsAll(premium));
        for (String path : premium) {
            var incomplete = new HashSet<>(complete); incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        String master = premium.getFirst();
        check("image/png".equals(SiteAssetPublisher.validateImage(master, png(1536, 1024))));
        check("image/png".equals(SiteAssetPublisher.validateImage(master, png(512, 512))));
        rejected(() -> SiteAssetPublisher.validateImage(master, png(4097, 512)));
        rejected(() -> SiteAssetPublisher.validateImage(master, png(512, 511)));
        var rgb = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(512, 512, BufferedImage.TYPE_INT_RGB), "png", rgb);
        rejected(() -> SiteAssetPublisher.validateImage(master, rgb.toByteArray()));
        var extraMaster = new HashSet<>(complete); extraMaster.add("images/premium-puppies-v1/premium-marshmallow-preview.png");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(extraMaster));
        var artDogs = new ArrayList<String>();
        for (int i = 1; i <= 30; i++) {
            String path = "images/pixel-art-dogs-v1/art-%02d.png".formatted(i);
            artDogs.add(path); complete.add(path);
            check("image/png".equals(SiteAssetPublisher.validateImage(path, png(1254, 1254))));
            rejected(() -> SiteAssetPublisher.validateImage(path, png(64, 64)));
        }
        check(SiteAssetPublisher.cdnSamplesFor(complete).size() == 64);
        check(SiteAssetPublisher.cdnSamplesFor(complete).containsAll(artDogs));
        for (String path : artDogs) {
            var incomplete = new HashSet<>(complete); incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        String artMaster = artDogs.getFirst();
        check("image/png".equals(SiteAssetPublisher.validateImage(artMaster, png(512, 512))));
        check("image/png".equals(SiteAssetPublisher.validateImage(artMaster, png(1536, 1024))));
        rejected(() -> SiteAssetPublisher.validateImage(artMaster, png(4097, 512)));
        rejected(() -> SiteAssetPublisher.validateImage(artMaster, png(512, 511)));
        rejected(() -> SiteAssetPublisher.validateImage(artMaster, rgb.toByteArray()));
        var extraArt = new HashSet<>(complete); extraArt.add("images/pixel-art-dogs-v1/art-01-preview.png");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(extraArt));
        var art16 = new ArrayList<String>();
        var breeds = new ArrayList<Map<String, Object>>();
        for (String breed : BreedCatalog.IDS) {
            var scenes = new LinkedHashMap<String, Object>();
            for (String scene : List.of("idle", "side", "walk", "happy", "sleep")) {
                String path = "images/art16-scenes-v1/" + breed + "/" + scene + ".png";
                art16.add(path); complete.add(path);
                int frames = scene.equals("walk") ? 8 : 1;
                check("image/png".equals(SiteAssetPublisher.validateImage(path, png(256 * frames, 256))));
                rejected(() -> SiteAssetPublisher.validateImage(path, png(64 * frames, 64)));
                scenes.put(scene, Map.of("png", "/" + path, "frames", frames, "frameMs", 150));
            }
            breeds.add(Map.of("breed", breed, "width", 256, "height", 256, "aseprite", "/downloads/art16-scenes-v1/" + breed + ".aseprite", "scenes", scenes));
        }
        check(SiteAssetPublisher.cdnSamplesFor(complete).size() == 214);
        check(SiteAssetPublisher.cdnSamplesFor(complete).containsAll(art16));
        for (String path : art16) {
            var incomplete = new HashSet<>(complete); incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        var extraScene = new HashSet<>(complete); extraScene.add("images/art16-scenes-v1/pomeranian/preview.png");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(extraScene));
        rejected(() -> SiteAssetPublisher.validateImage("images/art16-scenes-v1/pomeranian/walk.png", png(2047, 256)));
        rejected(() -> SiteAssetPublisher.validateImage("images/art16-scenes-v1/pomeranian/idle.png", rgb.toByteArray()));
        var mapper = new ObjectMapper();
        var validManifest = mapper.valueToTree(Map.of("version", 1, "styleId", "art-16-scenes", "breeds", breeds));
        SiteAssetPublisher.validateArt16Manifest(validManifest); check(true);
        rejected(() -> SiteAssetPublisher.validateArt16Manifest(mapper.valueToTree(Map.of("version", 1, "styleId", "art-16", "breeds", breeds))));
        rejected(() -> SiteAssetPublisher.validateArt16Manifest(mapper.valueToTree(Map.of("version", 1, "styleId", "art-16-scenes", "breeds", breeds.subList(0, 29)))));
        var duplicateBreed = new ArrayList<>(breeds); duplicateBreed.set(29, breeds.getFirst());
        rejected(() -> SiteAssetPublisher.validateArt16Manifest(mapper.valueToTree(Map.of("version", 1, "styleId", "art-16-scenes", "breeds", duplicateBreed))));
        var missingWalk = new ArrayList<>(breeds); var missingEntry = new HashMap<>(breeds.getFirst());
        var missingScenes = new HashMap<>((Map<String, Object>) missingEntry.get("scenes")); missingScenes.remove("walk"); missingEntry.put("scenes", missingScenes); missingWalk.set(0, missingEntry);
        rejected(() -> SiteAssetPublisher.validateArt16Manifest(mapper.valueToTree(Map.of("version", 1, "styleId", "art-16-scenes", "breeds", missingWalk))));
        var soft = new ArrayList<String>();
        var candidates = new ArrayList<Map<String, Object>>();
        for (int index = 1; index <= 15; index++) {
            String id = "sp-%02d".formatted(index), prefix = "images/soft-pixel-v1/" + id + "/";
            for (String layer : List.of("body", "eyes-dot", "eyes-bean", "eyes-sparkle", "eyes-sleep", "preview")) {
                String path = prefix + layer + ".png";
                soft.add(path); complete.add(path);
                check("image/png".equals(SiteAssetPublisher.validateImage(path, png(192, 192))));
                rejected(() -> SiteAssetPublisher.validateImage(path, png(64, 64)));
                rejected(() -> SiteAssetPublisher.validateImage(path, png(192, 193)));
            }
            var eyePaths = new HashMap<String, Object>();
            for (String eye : List.of("dot", "bean", "sparkle", "sleep")) eyePaths.put(eye, "/" + prefix + "eyes-" + eye + ".png");
            candidates.add(Map.of("id", id, "name", id, "width", 192, "height", 192, "body", "/" + prefix + "body.png", "png", "/" + prefix + "preview.png",
                "eyes", eyePaths, "aseprite", "/downloads/soft-pixel-v1/" + id + ".aseprite", "eyeAnchors", List.of(Map.of("x", 80, "y", 80, "rx", 5, "ry", 6), Map.of("x", 112, "y", 80, "rx", 5, "ry", 6)), "defaultEyes", "bean"));
        }
        check(SiteAssetPublisher.cdnSamplesFor(complete).size() == 304);
        check(SiteAssetPublisher.cdnSamplesFor(complete).containsAll(soft));
        for (String path : soft) {
            var incomplete = new HashSet<>(complete); incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        var extraSoft = new HashSet<>(complete); extraSoft.add("images/soft-pixel-v1/sp-16/body.png");
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(extraSoft));
        var rgbSoft = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(192, 192, BufferedImage.TYPE_INT_RGB), "png", rgbSoft);
        rejected(() -> SiteAssetPublisher.validateImage(soft.getFirst(), rgbSoft.toByteArray()));
        SiteAssetPublisher.validateSoftManifest(mapper.valueToTree(candidates)); check(true);
        rejected(() -> SiteAssetPublisher.validateSoftManifest(mapper.valueToTree(candidates.subList(0, 14))));
        var duplicateCandidate = new ArrayList<>(candidates); duplicateCandidate.set(14, candidates.getFirst());
        rejected(() -> SiteAssetPublisher.validateSoftManifest(mapper.valueToTree(duplicateCandidate)));
        var badEye = new ArrayList<>(candidates); var badEyeEntry = new HashMap<>(candidates.getFirst());
        badEyeEntry.put("eyes", Map.of("dot", "https://example.com/eyes.png")); badEye.set(0, badEyeEntry);
        rejected(() -> SiteAssetPublisher.validateSoftManifest(mapper.valueToTree(badEye)));
        var badAnchor = new ArrayList<>(candidates); var badAnchorEntry = new HashMap<>(candidates.getFirst());
        badAnchorEntry.put("eyeAnchors", List.of(Map.of("x", -1, "y", 80, "rx", 5, "ry", 6), Map.of("x", 112, "y", 80, "rx", 5, "ry", 6))); badAnchor.set(0, badAnchorEntry);
        rejected(() -> SiteAssetPublisher.validateSoftManifest(mapper.valueToTree(badAnchor)));
        var entireInventory = new HashSet<>(complete);
        entireInventory.addAll(Set.of("images/cozy-room.png", "images/puppy-style-preview.png"));
        for (int index = 1; index <= 30; index++) entireInventory.add("images/pixel-art-v1/art-%02d.png".formatted(index));
        SiteAssetPublisher.validateSoftInventory(entireInventory); check(entireInventory.size() == 345);
        for (String path : entireInventory) {
            var missingFile = new HashSet<>(entireInventory); missingFile.remove(path);
            rejected(() -> SiteAssetPublisher.validateSoftInventory(missingFile));
        }
        var replacedLegacy = new HashSet<>(entireInventory); replacedLegacy.remove("images/cozy-room.png"); replacedLegacy.add("images/unreviewed.png");
        rejected(() -> SiteAssetPublisher.validateSoftInventory(replacedLegacy));
        var spPaths = new ArrayList<String>();
        var spRecords = new ArrayList<Map<String,Object>>();
        for (String style : List.of("sp08", "sp15")) for (String breed : BreedCatalog.IDS) {
            var scenes = new LinkedHashMap<String,Object>();
            var bounds = new LinkedHashMap<String,Object>();
            for (String scene : List.of("idle", "side", "walk", "happy", "sleep", "wag")) {
                String path = "images/sp-scenes-v1/" + style + "/" + breed + "/" + scene + ".png";
                int frames = scene.equals("walk") ? 8 : scene.equals("wag") ? 4 : 1;
                int duration = scene.equals("walk") ? 125 : scene.equals("wag") ? 150 : scene.equals("sleep") ? 1000 : 600;
                scenes.put(scene, Map.of("png", "/" + path, "frames", frames, "frameMs", duration));
                bounds.put(scene, Collections.nCopies(frames, Map.of("x", 10, "y", 10, "width", 160, "height", 170)));
                spPaths.add(path);entireInventory.add(path);
            }
            spRecords.add(Map.of("style",style,"breed",breed,"width",192,"height",192,"aseprite","/downloads/sp-scenes-v1/"+style+"/"+breed+".aseprite","scenes",scenes,"frameBounds",bounds));
        }
        SiteAssetPublisher.validateSpInventory(entireInventory);check(entireInventory.size() == 705);
        check(SiteAssetPublisher.cdnSamplesFor(entireInventory).size() == 664 && SiteAssetPublisher.cdnSamplesFor(entireInventory).containsAll(spPaths));
        for (String path : spPaths) {
            var incomplete = new HashSet<>(entireInventory);incomplete.remove(path);
            rejected(() -> SiteAssetPublisher.validateSpInventory(incomplete));
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        var unexpectedSp = new HashSet<>(entireInventory);unexpectedSp.add("images/sp-scenes-v1/sp08/pomeranian/preview.png");
        rejected(() -> SiteAssetPublisher.validateSpInventory(unexpectedSp));
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(unexpectedSp));
        SiteAssetPublisher.validateSpManifest(mapper.valueToTree(spRecords));check(true);
        rejected(() -> SiteAssetPublisher.validateSpManifest(mapper.valueToTree(spRecords.subList(0,59))));
        var duplicateSp = new ArrayList<>(spRecords);duplicateSp.set(59,spRecords.getFirst());
        rejected(() -> SiteAssetPublisher.validateSpManifest(mapper.valueToTree(duplicateSp)));
        var missingWag = new ArrayList<>(spRecords);var missingWagRecord = new HashMap<>(spRecords.getFirst());
        var missingWagScenes = new HashMap<>((Map<String,Object>)missingWagRecord.get("scenes"));missingWagScenes.remove("wag");missingWagRecord.put("scenes",missingWagScenes);missingWag.set(0,missingWagRecord);
        rejected(() -> SiteAssetPublisher.validateSpManifest(mapper.valueToTree(missingWag)));
        var wrongWag = new ArrayList<>(spRecords);var wrongWagRecord = new HashMap<>(spRecords.getFirst());
        var wrongWagScenes = new HashMap<>((Map<String,Object>)wrongWagRecord.get("scenes"));wrongWagScenes.put("wag",Map.of("png","/images/sp-scenes-v1/sp08/pomeranian/wag.png","frames",1,"frameMs",150));wrongWagRecord.put("scenes",wrongWagScenes);wrongWag.set(0,wrongWagRecord);
        rejected(() -> SiteAssetPublisher.validateSpManifest(mapper.valueToTree(wrongWag)));
        for (String scene : List.of("idle","walk","wag")) {
            int frames = scene.equals("walk") ? 8 : scene.equals("wag") ? 4 : 1;
            String path = "images/sp-scenes-v1/sp08/pomeranian/" + scene + ".png";
            check("image/png".equals(SiteAssetPublisher.validateImage(path,png(192*frames,192))));
            rejected(() -> SiteAssetPublisher.validateImage(path,png(64*frames,64)));
            rejected(() -> SiteAssetPublisher.validateImage(path,rgbSoft.toByteArray()));
        }
        rejected(() -> SiteAssetPublisher.validateImage("images/sp-scenes-v1/sp08/pomeranian/wag.png",png(767,192)));
        check("image/png".equals(SiteAssetPublisher.validateImage("images/puppies.png", png(512, 320))));
        var consolidated = new HashSet<>(entireInventory);
        var docs = List.of("dog-breeds-30", "dog-styles-16", "meadow-samoyed", "shiba-coats-10");
        for (String name : docs) consolidated.add("images/docs-previews/" + name + ".png");
        SiteAssetPublisher.validateSiteInventory(consolidated); check(consolidated.size() == 709);
        check(SiteAssetPublisher.cdnSamplesFor(consolidated).size() == 668);
        rejected(() -> SiteAssetPublisher.validateSiteInventory(entireInventory));
        for (String name : docs) {
            var incomplete = new HashSet<>(consolidated); incomplete.remove("images/docs-previews/" + name + ".png");
            rejected(() -> SiteAssetPublisher.validateSiteInventory(incomplete));
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(incomplete));
        }
        var extraDoc = new HashSet<>(consolidated); extraDoc.add("images/docs-previews/private-screenshot.png");
        rejected(() -> SiteAssetPublisher.validateSiteInventory(extraDoc));
        rejected(() -> SiteAssetPublisher.cdnSamplesFor(extraDoc));
        System.out.println("PASS: " + checks + " offline publication checks; exact 709-image inventory preserves 705 previous images and adds 4 documentation previews; all new CDN bodies required.");
    }
}
