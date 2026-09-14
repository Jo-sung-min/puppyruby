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
    public static void main(String[] args) throws Exception {
        Path scope = Path.of(args[0]).toRealPath(), work = Files.createTempDirectory(scope, "offline-check-");
        Set<String> paths = RubyRoundAssetPublisher.expectedPaths();
        check(paths.size() == 511, "Fixed exact pack size");
        check(paths.stream().filter(p -> p.endsWith(".png")).count() == 480, "Only 450 scene variants and 30 eyes");
        check(paths.stream().filter(p -> p.endsWith(".aseprite")).count() == 31, "Only 30 breed masters and one common-eye master");
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
        System.out.println("PASS " + checks + " offline Ruby Round publisher checks: finite 511 paths, native headers, proof hashes, full remote body integrity, immutable release identity and local-change refusal.");
    }
}
