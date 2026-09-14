import java.nio.file.*;
import java.util.*;

/** Offline regression for independent pack isolation from the original immutable releases. */
public final class LegacyMediaIsolationTest {
    static int checks;
    static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    static void file(Path root, String relative) throws Exception { Path target = root.resolve(relative); Files.createDirectories(target.getParent()); Files.write(target, new byte[]{1}); }
    static Set<String> relative(Path root, List<Path> paths) { Set<String> output = new HashSet<>(); paths.forEach(path -> output.add(root.relativize(path).toString().replace('\\', '/'))); return output; }
    public static void main(String[] args) throws Exception {
        Path project = Path.of(args[0]).toRealPath();
        Path fixture = Files.createTempDirectory(project.resolve("backend/build/ruby-round-publisher"), "legacy-scope-");
        for (String path : List.of("images/old/style.png", "images/ruby-round-v1/shiba/idle.png", "images/ruby-round-v1/eyes/eye-01.png",
            "images/ruby-round-v11/new.png", "images/ruby-round-v1.png", "favicon.svg", "downloads/PuppyRuby.exe",
            "downloads/ruby-round-v1/shiba.aseprite", "downloads/ruby-round-v1/any/private.dat", "downloads/ruby-round-v11/other.aseprite")) file(fixture, path);
        Set<String> images = relative(fixture, SiteAssetPublisher.collectSources(fixture));
        check(images.equals(Set.of("images/old/style.png", "images/ruby-round-v11/new.png", "images/ruby-round-v1.png", "favicon.svg")), "Exclude only the exact Ruby Round image subtree, including nested eyes");
        Set<String> downloads = relative(fixture, SiteDownloadPublisher.collectSources(fixture));
        check(downloads.stream().noneMatch(path -> path.equals("downloads/ruby-round-v1") || path.startsWith("downloads/ruby-round-v1/")), "Independent masters and any nested contents never enter legacy inventory");
        check(downloads.contains("downloads/PuppyRuby.exe") && downloads.contains("downloads/ruby-round-v11/other.aseprite"), "Installers and similarly named unknown directories retain legacy validation");
        Path actualRoot = project.resolve("local-assets/site").toRealPath();
        Set<String> actualImages = relative(actualRoot, SiteAssetPublisher.collectSources(actualRoot));
        check(actualImages.size() == 709, "Original image release still contains exactly 709 files");
        check(actualImages.stream().noneMatch(path -> path.startsWith("images/ruby-round-v1/")), "No independently published image changes the original release hash input");
        SiteAssetPublisher.validateSiteInventory(actualImages); checks++;
        var actualDownloads = SiteDownloadPublisher.inventory(actualRoot);
        check(actualDownloads.size() == 188, "Original download release still contains exactly 188 validated files");
        check(actualDownloads.stream().noneMatch(asset -> asset.path().startsWith("downloads/ruby-round-v1/")), "No independently published master changes the original download hash input");
        check(actualDownloads.stream().noneMatch(asset -> SiteDownloadPublisher.EXCLUDED_SERVER_PATHS.contains(asset.path())), "Server artifacts remain excluded");
        System.out.println("PASS " + checks + " legacy media isolation checks: actual 709 image /188 download scope preserved, exact pack subtree excluded, sibling paths still validated.");
    }
}
