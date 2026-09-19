import java.nio.file.*;
import java.util.*;

/** Offline regression: retired artwork stays outside shared image/download releases. */
public final class LegacyMediaIsolationTest {
    static int checks;
    static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    static void file(Path root, String relative) throws Exception { Path target = root.resolve(relative); Files.createDirectories(target.getParent()); Files.write(target, new byte[]{1}); }
    static Set<String> relative(Path root, List<Path> paths) { Set<String> output = new HashSet<>(); paths.forEach(path -> output.add(root.relativize(path).toString().replace('\\', '/'))); return output; }
    public static void main(String[] args) throws Exception {
        Path project = Path.of(args[0]).toRealPath();
        Path fixture = Files.createTempDirectory(project.resolve("backend/build/ruby-round-publisher"), "shared-scope-");
        for (String path : SiteAssetPublisher.PUBLIC_PATHS) file(fixture, path);
        for (String path : SiteDownloadPublisher.ALLOWED_PATHS) file(fixture, path);
        for (String path : List.of("images/pixel-art-v1/art-01.png", "images/docs-previews/dog-styles-16.png",
                "images/puppies.png", "images/ruby-round-v1/shiba/idle.png", "downloads/puppyruby-pixel-art-30.zip",
                "downloads/art16-scenes-v1/pomeranian.aseprite", "downloads/ruby-round-v1/shiba.aseprite", "downloads/PuppyRuby-server.jar")) file(fixture, path);
        Set<String> images = relative(fixture, SiteAssetPublisher.collectSources(fixture));
        check(images.equals(SiteAssetPublisher.PUBLIC_PATHS), "Shared publisher selects exactly favicon and two backgrounds");
        Set<String> downloads = relative(fixture, SiteDownloadPublisher.collectSources(fixture));
        check(downloads.equals(SiteDownloadPublisher.ALLOWED_PATHS), "Download publisher selects exactly desktop binaries and sidecars");

        Path actualRoot = project.resolve("local-assets/site").toRealPath();
        Set<String> actualImages = relative(actualRoot, SiteAssetPublisher.collectSources(actualRoot));
        check(actualImages.equals(SiteAssetPublisher.PUBLIC_PATHS), "Actual shared image inventory contains exactly 3 files");
        SiteAssetPublisher.validateSiteInventory(actualImages); checks++;
        var actualDownloads = SiteDownloadPublisher.inventory(actualRoot);
        check(actualDownloads.size() == 4, "Actual public download inventory contains exactly 4 desktop files");
        check(actualDownloads.stream().map(SiteDownloadPublisher.Asset::path).collect(java.util.stream.Collectors.toSet()).equals(SiteDownloadPublisher.ALLOWED_PATHS), "No artwork or server binary enters downloads");
        System.out.println("PASS " + checks + " media isolation checks: exact 3 shared images / 4 desktop downloads; all dog art comes only from Ruby Round.");
    }
}
