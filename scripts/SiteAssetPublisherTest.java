import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import javax.imageio.ImageIO;

/** Offline guards for the shared site-only release. */
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
        Set<String> allowed = SiteAssetPublisher.PUBLIC_PATHS;
        check(allowed.size() == 3);
        SiteAssetPublisher.validateSiteInventory(allowed); check(true);
        check(SiteAssetPublisher.cdnSamplesFor(allowed).equals(allowed));
        for (String path : allowed) {
            var missing = new HashSet<>(allowed); missing.remove(path);
            rejected(() -> SiteAssetPublisher.validateSiteInventory(missing));
            rejected(() -> SiteAssetPublisher.cdnSamplesFor(missing));
        }
        for (String legacy : Set.of("images/pixel-art-v1/art-01.png", "images/art16-scenes-v1/pomeranian/idle.png",
                "images/soft-pixel-v1/sp-01/preview.png", "images/sp-scenes-v1/sp08/pomeranian/walk.png", "images/ruby-round-v1/pomeranian/idle.png")) {
            var extra = new HashSet<>(allowed); extra.add(legacy);
            rejected(() -> SiteAssetPublisher.validateSiteInventory(extra));
        }
        for (String escaped : Set.of("../favicon.svg", "images/../private.png", "/images/pixel-garden.svg")) {
            var extra = new HashSet<>(allowed); extra.add(escaped);
            rejected(() -> SiteAssetPublisher.validateSiteInventory(extra));
        }
        check("image/png".equals(SiteAssetPublisher.validateImage("images/cozy-room.png", png(512, 320))));
        rejected(() -> SiteAssetPublisher.validateImage("images/cozy-room.png", new byte[]{1, 2, 3}));
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 2 2\"><path d=\"M0 0h2v2H0z\"/></svg>".getBytes(StandardCharsets.UTF_8);
        check("image/svg+xml".equals(SiteAssetPublisher.validateImage("images/pixel-garden.svg", svg)));
        rejected(() -> SiteAssetPublisher.validateImage("images/pixel-garden.svg", "<html/>".getBytes(StandardCharsets.UTF_8)));
        check("image/svg+xml".equals(SiteAssetPublisher.validateImage("favicon.svg", svg)));
        System.out.println("PASS: " + checks + " offline site publication checks; exact 3-file shared inventory excludes every legacy dog-style subtree and preview.");
    }
}
