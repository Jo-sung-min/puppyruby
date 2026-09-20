import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import javax.net.ssl.HttpsURLConnection;
import com.puppyruby.game.BreedCatalog;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/** Publishes the explicitly reviewed public downloads only. No work directory is traversed. */
public final class SiteDownloadPublisher {
    static final String CACHE = "public, max-age=31536000, immutable";
    static final long MAX_FILE_BYTES = 200L * 1024 * 1024;
    static final Set<String> EXCLUDED_SERVER_PATHS = Set.of("downloads/PuppyRuby-server.jar", "downloads/PuppyRuby-server.jar.sha256", "downloads/PuppyRuby-server.sha256");
    static final Set<String> ALLOWED_PATHS = allowedPaths();
    static final ObjectMapper JSON = new ObjectMapper();
    private static String phase = "plan", currentPath = "";
    record Asset(Path source, String path, String contentType, String disposition, long size, String sha256, String checksum) {}
    record Digest(long bytes, String hex, String base64) {}
    record DesktopBuild(String version, String notes) {}

    /** Exact allowlist: artwork sources and retired archives can never enter a future release. */
    static List<Path> collectSources(Path publicRoot) throws IOException {
        return ALLOWED_PATHS.stream().sorted().map(publicRoot::resolve).toList();
    }

    public static void main(String[] args) {
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        try { run(args); }
        catch (Throwable error) {
            String code = error instanceof Refused refused ? refused.code : error instanceof S3Exception ? "S3_REQUEST_FAILED" : "DOWNLOAD_OPERATION_FAILED";
            int status = error instanceof S3Exception s3 ? s3.statusCode() : 0;
            System.out.println("{\"success\":false,\"phase\":" + quote(phase) + ",\"path\":" + quote(currentPath) + ",\"error\":" + quote(code) + ",\"status\":" + status + "}");
            System.exit(1);
        }
    }

    private static void run(String[] args) throws Exception {
        if (args.length != 2 || !Set.of("Plan", "Publish", "Verify").contains(args[1])) throw new Refused("INVALID_ACTION");
        Path project = Path.of(args[0]).toRealPath();
        Path publicRoot = project.resolve("local-assets/site").toRealPath();
        if (!publicRoot.equals(project.resolve("local-assets/site")) || !publicRoot.startsWith(project)) throw new Refused("SOURCE_ROOT_OUTSIDE_PROJECT");
        List<Asset> assets = inventory(publicRoot);
        DesktopBuild build = desktopBuild(project, assets);
        StringBuilder canonical = new StringBuilder();
        for (Asset asset : assets) canonical.append(asset.path()).append('\t').append(asset.contentType()).append('\t').append(asset.disposition())
            .append('\t').append(CACHE).append('\t').append(asset.size()).append('\t').append(asset.sha256()).append('\n');
        String manifestHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        String release = manifestHash.substring(0, 16);
        validatePublishedVersion(project, build, release);
        String bucket = required("S3_BUCKET"), region = required("AWS_REGION"), prefix = required("S3_KEY_PREFIX").replaceAll("/+$", "");
        if (!bucket.equals("fatell-aws-s3") || !prefix.equals("puppyruby")) throw new Refused("DESTINATION_OUTSIDE_AUTHORIZED_SCOPE");
        if (!region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]")) throw new Refused("INVALID_REGION");
        String keyBase = prefix + "/site-downloads/" + release;
        String originPath = System.getenv().getOrDefault("CDN_ORIGIN_PATH", "").strip().replaceAll("^/+|/+$", "");
        String cdnBase = cdnBase(required("CDN_BASE_URL"), keyBase, originPath);
        requireUpdateDestination(release, cdnBase);
        Path output = project.resolve("local-assets/work/site-downloads/" + release);
        Files.createDirectories(output);
        if (!output.toRealPath().startsWith(project.resolve("local-assets/work").toRealPath())) throw new Refused("OUTPUT_PATH_OUTSIDE_WORK");
        long totalBytes = assets.stream().mapToLong(Asset::size).sum();
        Files.writeString(output.resolve("manifest.json"), manifest(assets, manifestHash, release, keyBase, cdnBase, originPath, totalBytes));
        currentPath = "";
        System.out.println("DOWNLOAD_RELEASE=" + release);
        System.out.println("DOWNLOAD_CDN_BASE=" + cdnBase);
        System.out.println("DOWNLOAD_COUNT=" + assets.size());
        System.out.println("DOWNLOAD_TOTAL_BYTES=" + totalBytes);
        System.out.println("DOWNLOAD_SERVER_ARTIFACTS_EXCLUDED=true");
        System.out.println("DOWNLOAD_MANIFEST=" + output.resolve("manifest.json"));
        if (args[1].equals("Plan")) { System.out.println("PLAN_ONLY=true"); return; }

        int uploaded = 0, skipped = 0;
        try (var client = S3Client.builder().region(Region.of(region)).credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .endpointOverride(URI.create("https://s3." + region + ".amazonaws.com"))
            .overrideConfiguration(value -> value.apiCallTimeout(Duration.ofMinutes(10)).apiCallAttemptTimeout(Duration.ofMinutes(8))).build()) {
            for (Asset asset : assets) {
                currentPath = asset.path(); phase = "s3-head";
                String key = keyBase + "/" + asset.path();
                HeadObjectResponse existing = head(client, bucket, key);
                if (existing != null) { verifyHead(existing, asset); skipped++; }
                else {
                    if (args[1].equals("Verify")) throw new Refused("REMOTE_DOWNLOAD_MISSING");
                    phase = "s3-create";
                    Digest before = digest(asset.source());
                    if (before.bytes() != asset.size() || !before.hex().equals(asset.sha256())) throw new Refused("LOCAL_DOWNLOAD_CHANGED_AFTER_PLAN");
                    try {
                        client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(asset.contentType())
                            .contentDisposition(asset.disposition()).contentLength(asset.size()).cacheControl(CACHE)
                            .metadata(Map.of("sha256", asset.sha256())).checksumSHA256(asset.checksum()).ifNoneMatch("*").build(), RequestBody.fromFile(asset.source()));
                        uploaded++;
                    } catch (S3Exception conflict) { if (conflict.statusCode() != 412) throw conflict; skipped++; }
                    phase = "s3-verify";
                    HeadObjectResponse saved = head(client, bucket, key);
                    if (saved == null) throw new Refused("CREATED_DOWNLOAD_NOT_FOUND");
                    verifyHead(saved, asset);
                }
                System.out.println("S3_VERIFIED=" + asset.path());
            }
        }
        Files.writeString(output.resolve("s3-verification.json"), verification(release, uploaded, skipped, assets.size(), List.of()));
        var verified = new ArrayList<String>();
        for (Asset asset : assets) {
            currentPath = asset.path(); phase = "cdn-verify";
            verifyCdn(cdnBase, asset);
            verified.add(asset.path());
            System.out.println("CDN_BODY_VERIFIED=" + asset.path());
        }
        String verification = verification(release, uploaded, skipped, assets.size(), verified);
        Files.writeString(output.resolve("verification.json"), verification);
        Files.writeString(output.resolve("cdn-verification.json"), verification);
        phase = "register-verified-update";
        // Never advertise an unuploaded build or a release with an incomplete CDN body check.
        if (!desktopBuild(project, assets).equals(build)) throw new Refused("DESKTOP_BUILD_CHANGED_DURING_PUBLISH");
        byte[] update = updateManifest(build, assets, release, cdnBase, Instant.now());
        update = publishLatestPointer(bucket, region, prefix, build, assets, release, cdnBase, update);
        registerUpdate(project, build, assets, release, cdnBase, assets.size(), verified, update);
        currentPath = "";
        System.out.println("DOWNLOAD_PUBLISH_SUCCESS=true UPLOADED=" + uploaded + " EXISTING=" + skipped + " S3_VERIFIED=" + assets.size() + " CDN_VERIFIED=" + verified.size());
    }

    static DesktopBuild desktopBuild(Path project, List<Asset> assets) throws IOException {
        Path definitionPath = project.resolve("desktop/version.json");
        Path buildPath = project.resolve("local-assets/site/downloads/desktop-build.json");
        checkedPath(project, definitionPath);
        checkedPath(project, buildPath);
        if (Files.size(definitionPath) > 8192 || Files.size(buildPath) > 8192) throw new Refused("DESKTOP_BUILD_METADATA_TOO_LARGE");
        JsonNode definition = JSON.readTree(Files.readString(definitionPath));
        JsonNode staged = JSON.readTree(Files.readString(buildPath));
        if (!definition.isObject() || !staged.isObject()) throw new Refused("INVALID_DESKTOP_BUILD_METADATA");
        String version = textField(definition, "version"), notes = textField(definition, "notes");
        validateVersion(version);
        if (notes.length() > 500 || notes.matches("(?s).*[\\x00-\\x1f\\x7f<>].*")) throw new Refused("INVALID_DESKTOP_RELEASE_NOTES");
        if (!staged.path("schemaVersion").isIntegralNumber() || staged.path("schemaVersion").asInt() != 1
            || !version.equals(textField(staged, "version")) || !notes.equals(textField(staged, "notes"))
            || !staged.path("files").isArray() || staged.path("files").size() != 2) throw new Refused("STALE_DESKTOP_BUILD_METADATA");
        var checked = new HashSet<String>();
        for (JsonNode file : staged.path("files")) {
            String path = textField(file, "path");
            if (!Set.of("downloads/PuppyRuby.exe", "downloads/PuppyRuby-Setup.exe").contains(path) || !checked.add(path))
                throw new Refused("INVALID_DESKTOP_BUILD_FILES");
            Asset asset = assets.stream().filter(item -> item.path().equals(path)).findFirst().orElseThrow(() -> new Refused("DESKTOP_BUILD_FILE_MISSING"));
            if (!version.equals(textField(file, "version")) || !asset.sha256().equals(textField(file, "sha256"))
                || !file.path("size").isIntegralNumber() || file.path("size").asLong() != asset.size()) throw new Refused("DESKTOP_BUILD_FINGERPRINT_MISMATCH");
        }
        return new DesktopBuild(version, notes);
    }

    static void validateVersion(String version) {
        if (!version.matches("(?:0|[1-9][0-9]{0,4})(?:\\.(?:0|[1-9][0-9]{0,4})){3}")
            || Arrays.stream(version.split("\\.")).mapToInt(Integer::parseInt).anyMatch(value -> value > 65535)) throw new Refused("INVALID_DESKTOP_VERSION");
    }

    static String textField(JsonNode node, String key) {
        if (!node.path(key).isString()) throw new Refused("INVALID_DESKTOP_METADATA_FIELD");
        return node.path(key).asString();
    }

    static void requireUpdateDestination(String release, String cdn) {
        if (!release.matches("[a-f0-9]{16}") || !cdn.equals("https://cdn.puppyruby.com/site-downloads/" + release))
            throw new Refused("INVALID_DESKTOP_UPDATE_DESTINATION");
    }

    static void validatePublishedVersion(Path project, DesktopBuild build, String release) throws IOException {
        Path latest = project.resolve("frontend/src/lib/generated/desktop-update-release.json");
        checkedPath(project, latest);
        JsonNode previous = JSON.readTree(Files.readString(latest));
        if (previous.isNull()) return;
        String oldVersion = textField(previous, "version"), oldRelease = textField(previous, "release");
        validateVersion(oldVersion); validateVersion(build.version());
        int[] oldParts = Arrays.stream(oldVersion.split("\\.")).mapToInt(Integer::parseInt).toArray();
        int[] newParts = Arrays.stream(build.version().split("\\.")).mapToInt(Integer::parseInt).toArray();
        int comparison = Arrays.compare(newParts, oldParts);
        if (comparison < 0 || (comparison == 0 && !release.equals(oldRelease))) throw new Refused("BUMP_DESKTOP_VERSION_BEFORE_NEW_RELEASE");
    }

    static void registerUpdate(Path project, DesktopBuild build, List<Asset> assets, String release, String cdn,
                               int s3Verified, List<String> cdnVerified) throws IOException {
        registerUpdate(project, build, assets, release, cdn, s3Verified, cdnVerified,
            updateManifest(build, assets, release, cdn, Instant.now()));
    }

    static void registerUpdate(Path project, DesktopBuild build, List<Asset> assets, String release, String cdn,
                               int s3Verified, List<String> cdnVerified, byte[] latestBytes) throws IOException {
        validateInventory(new HashSet<>(assets.stream().map(Asset::path).toList()));
        if (s3Verified != 4 || cdnVerified.size() != 4 || !new HashSet<>(cdnVerified).equals(ALLOWED_PATHS))
            throw new Refused("DESKTOP_RELEASE_NOT_FULLY_VERIFIED");
        requireUpdateDestination(release, cdn);
        validateVersion(build.version());
        validatePublishedVersion(project, build, release);
        Asset installer = assets.stream().filter(item -> item.path().equals("downloads/PuppyRuby-Setup.exe")).findFirst().orElseThrow();
        Path generated = project.resolve("frontend/src/lib/generated");
        Path latest = generated.resolve("desktop-update-release.json"), media = generated.resolve("public-media-release.json");
        checkedPath(project, generated); checkedPath(project, latest); checkedPath(project, media);
        byte[] oldMedia = Files.readAllBytes(media);
        var publicMedia = JSON.readTree(oldMedia);
        if (!publicMedia.isObject() || !publicMedia.path("images").isObject() || !publicMedia.path("downloads").isObject())
            throw new Refused("INVALID_PUBLIC_MEDIA_RELEASE");
        validateUpdateManifest(JSON.readTree(latestBytes), build, installer, release, cdn);
        ((tools.jackson.databind.node.ObjectNode) publicMedia).putObject("downloads").put("release", release).put("baseUrl", cdn);
        byte[] mediaBytes = (JSON.writerWithDefaultPrettyPrinter().writeValueAsString(publicMedia) + "\n").getBytes(StandardCharsets.UTF_8);
        // Both complete documents are prepared before replacing either public pointer.
        // A failed second replacement restores the first, leaving the prior release advertised.
        replaceAtomically(media, mediaBytes);
        try { replaceAtomically(latest, latestBytes); }
        catch (IOException failure) { replaceAtomically(media, oldMedia); throw failure; }
        System.out.println("DOWNLOAD_UPDATE_REGISTERED=" + build.version());
    }

    static byte[] updateManifest(DesktopBuild build, List<Asset> assets, String release, String cdn, Instant publishedAt) throws IOException {
        requireUpdateDestination(release, cdn); validateVersion(build.version());
        Asset installer = assets.stream().filter(item -> item.path().equals("downloads/PuppyRuby-Setup.exe")).findFirst().orElseThrow();
        var update = JSON.createObjectNode();
        update.put("schemaVersion", 1).put("version", build.version()).put("release", release)
            .put("publishedAt", publishedAt.truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString()).put("notes", build.notes());
        update.putObject("installer").put("url", cdn + "/downloads/PuppyRuby-Setup.exe").put("sha256", installer.sha256()).put("size", installer.size());
        return (JSON.writerWithDefaultPrettyPrinter().writeValueAsString(update) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    static void validateUpdateManifest(JsonNode value, DesktopBuild build, Asset installer, String release, String cdn) {
        if (!value.isObject() || !value.path("schemaVersion").isIntegralNumber() || value.path("schemaVersion").asInt() != 1
            || !build.version().equals(textField(value, "version")) || !release.equals(textField(value, "release"))
            || !build.notes().equals(textField(value, "notes")) || !value.path("publishedAt").isString())
            throw new Refused("INVALID_LATEST_DESKTOP_POINTER");
        try { Instant.parse(value.path("publishedAt").asString()); }
        catch (RuntimeException error) { throw new Refused("INVALID_LATEST_DESKTOP_POINTER"); }
        JsonNode file = value.path("installer");
        if (!file.isObject() || !(cdn + "/downloads/PuppyRuby-Setup.exe").equals(textField(file, "url"))
            || !installer.sha256().equals(textField(file, "sha256")) || !file.path("size").isIntegralNumber()
            || file.path("size").asLong() != installer.size()) throw new Refused("INVALID_LATEST_DESKTOP_POINTER");
    }

    static byte[] selectLatestPointer(byte[] existing, DesktopBuild build, Asset installer, String release, String cdn, byte[] replacement) throws IOException {
        if (existing == null) return replacement;
        if (existing.length < 1 || existing.length > 8192) throw new Refused("INVALID_LATEST_DESKTOP_POINTER");
        JsonNode current = JSON.readTree(existing);
        String currentVersion = textField(current, "version"), currentRelease = textField(current, "release");
        validateVersion(currentVersion); validateVersion(build.version());
        int comparison = Arrays.compare(Arrays.stream(build.version().split("\\.")).mapToInt(Integer::parseInt).toArray(),
            Arrays.stream(currentVersion.split("\\.")).mapToInt(Integer::parseInt).toArray());
        if (comparison < 0 || comparison == 0 && !release.equals(currentRelease)) throw new Refused("BUMP_DESKTOP_VERSION_BEFORE_NEW_RELEASE");
        if (comparison == 0) {
            validateUpdateManifest(current, build, installer, release, cdn);
            return existing;
        }
        return replacement;
    }

    private static byte[] publishLatestPointer(String bucket, String region, String prefix, DesktopBuild build,
                                                List<Asset> assets, String release, String cdn, byte[] replacement) throws IOException {
        Asset installer = assets.stream().filter(item -> item.path().equals("downloads/PuppyRuby-Setup.exe")).findFirst().orElseThrow();
        String key = prefix + "/site-downloads/latest-desktop-update.json";
        currentPath = "latest-desktop-update.json"; phase = "latest-pointer";
        try (var client = S3Client.builder().region(Region.of(region)).credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .endpointOverride(URI.create("https://s3." + region + ".amazonaws.com")).build()) {
            HeadObjectResponse head = head(client, bucket, key);
            byte[] existing = null;
            if (head != null) {
                var response = client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build());
                existing = response.asByteArray();
            }
            byte[] selected = selectLatestPointer(existing, build, installer, release, cdn, replacement);
            if (selected == existing) {
                System.out.println("DOWNLOAD_LATEST_POINTER_EXISTING=true");
                return existing;
            }
            var request = PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/json; charset=utf-8")
                .cacheControl("private, no-store, max-age=0").contentLength((long) selected.length)
                .metadata(Map.of("release", release, "version", build.version()));
            if (head == null) request.ifNoneMatch("*"); else request.ifMatch(head.eTag());
            try { client.putObject(request.build(), RequestBody.fromBytes(selected)); }
            catch (S3Exception conflict) { if (conflict.statusCode() == 412) throw new Refused("LATEST_DESKTOP_POINTER_CHANGED"); throw conflict; }
            System.out.println("DOWNLOAD_LATEST_POINTER_REGISTERED=" + build.version());
            return selected;
        }
    }

    static void replaceAtomically(Path target, byte[] bytes) throws IOException {
        Path temporary = Files.createTempFile(target.getParent(), ".desktop-release-", ".tmp");
        try {
            Files.write(temporary, bytes);
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally { Files.deleteIfExists(temporary); }
    }

    static List<Asset> inventory(Path publicRoot) throws Exception {
        Path root = publicRoot.toRealPath(), downloads = root.resolve("downloads");
        checkedPath(root, downloads);
        var assets = new ArrayList<Asset>();
        {
            for (Path source : collectSources(root)) {
                checkedPath(root, source);
                if (Files.isDirectory(source)) continue;
                if (!Files.isRegularFile(source)) throw new Refused("NON_REGULAR_DOWNLOAD");
                String relative = root.relativize(source).toString().replace('\\', '/');
                currentPath = relative;
                if (EXCLUDED_SERVER_PATHS.contains(relative)) continue;
                if (!ALLOWED_PATHS.contains(relative)) throw new Refused("UNREVIEWED_DOWNLOAD_PATH");
                long size = Files.size(source);
                if (size < 1 || size > MAX_FILE_BYTES) throw new Refused("DOWNLOAD_SIZE_OUT_OF_RANGE");
                String contentType = validateFile(source, relative, size);
                Digest digest = digest(source);
                if (digest.bytes() != size) throw new Refused("LOCAL_DOWNLOAD_CHANGED_DURING_PLAN");
                assets.add(new Asset(source, relative, contentType, "attachment; filename=\"" + source.getFileName() + "\"", size, digest.hex(), digest.base64()));
            }
        }
        validateInventory(new HashSet<>(assets.stream().map(Asset::path).toList()));
        if (assets.stream().mapToLong(Asset::size).sum() > 2L * 1024 * 1024 * 1024) throw new Refused("DOWNLOAD_TOTAL_SIZE_OUT_OF_RANGE");
        assets.sort(Comparator.comparing(Asset::path));
        Map<String, Asset> byPath = new HashMap<>();
        for (Asset asset : assets) byPath.put(asset.path(), asset);
        for (Asset asset : assets) if (asset.path().endsWith(".sha256")) {
            currentPath = asset.path();
            String target = switch (asset.path()) {
                case "downloads/PuppyRuby.sha256" -> "downloads/PuppyRuby.exe";
                case "downloads/PuppyRuby-Setup.sha256" -> "downloads/PuppyRuby-Setup.exe";
                default -> throw new Refused("UNREVIEWED_CHECKSUM_SIDECAR");
            };
            validateSidecar(Files.readString(asset.source()), byPath.get(target));
        }
        return List.copyOf(assets);
    }

    static void checkedPath(Path root, Path source) throws IOException {
        Path real = source.toRealPath();
        if (!real.startsWith(root) || !real.equals(source.toAbsolutePath().normalize()) || Files.isSymbolicLink(source)) throw new Refused("SOURCE_PATH_OUTSIDE_SCOPE");
    }

    static void validateInventory(Set<String> paths) {
        if (ALLOWED_PATHS.size() != 4 || !Collections.disjoint(ALLOWED_PATHS, EXCLUDED_SERVER_PATHS) || !paths.equals(ALLOWED_PATHS))
            throw new Refused("DOWNLOAD_COLLECTION_REQUIRES_EXACTLY_4_DESKTOP_FILES_WITHOUT_ARTWORK_OR_SERVER_ARTIFACTS");
    }

    static String validateFile(Path source, String path, long size) throws Exception {
        byte[] header;
        try (InputStream input = Files.newInputStream(source)) { header = input.readNBytes(128); }
        if (path.endsWith(".aseprite")) {
            if (header.length != 128) throw new Refused("ASEPRITE_HEADER_MISSING");
            var data = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
            if (Integer.toUnsignedLong(data.getInt(0)) != size || Short.toUnsignedInt(data.getShort(4)) != 0xa5e0
                || Short.toUnsignedInt(data.getShort(6)) < 1 || Short.toUnsignedInt(data.getShort(6)) > 1000
                || Short.toUnsignedInt(data.getShort(8)) < 1 || Short.toUnsignedInt(data.getShort(8)) > 16384
                || Short.toUnsignedInt(data.getShort(10)) < 1 || Short.toUnsignedInt(data.getShort(10)) > 16384
                || !Set.of(8, 16, 32).contains(Short.toUnsignedInt(data.getShort(12)))) throw new Refused("INVALID_ASEPRITE_HEADER");
            return "application/octet-stream";
        }
        if (path.endsWith(".zip")) {
            if (header.length < 4 || header[0] != 'P' || header[1] != 'K' || header[2] != 3 || header[3] != 4) throw new Refused("INVALID_ARCHIVE_SIGNATURE");
            validateArchive(source);
            return "application/zip";
        }
        if (path.endsWith(".exe")) {
            if (header.length != 128 || header[0] != 'M' || header[1] != 'Z') throw new Refused("INVALID_EXECUTABLE_HEADER");
            long peOffset = Integer.toUnsignedLong(ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN).getInt(60));
            if (peOffset < 64 || peOffset > size - 4) throw new Refused("INVALID_EXECUTABLE_PE_OFFSET");
            try (RandomAccessFile file = new RandomAccessFile(source.toFile(), "r")) {
                file.seek(peOffset);
                if (file.readInt() != 0x50450000) throw new Refused("INVALID_EXECUTABLE_PE_SIGNATURE");
            }
            return "application/vnd.microsoft.portable-executable";
        }
        if (path.endsWith(".sha256")) {
            if (size > 256) throw new Refused("CHECKSUM_SIDECAR_TOO_LARGE");
            if (!Files.readString(source).strip().matches("[A-Fa-f0-9]{64}  PuppyRuby(?:-Setup)?\\.exe")) throw new Refused("INVALID_CHECKSUM_SIDECAR");
            return "text/plain";
        }
        throw new Refused("UNSUPPORTED_DOWNLOAD_TYPE");
    }

    static void validateArchiveEntry(String name, long size) {
        if (name.isEmpty() || name.length() > 512 || name.startsWith("/") || name.indexOf('\\') >= 0 || name.indexOf(':') >= 0
            || Arrays.asList(name.split("/")).contains("..") || size < 0 || size > MAX_FILE_BYTES) throw new Refused("INVALID_ARCHIVE_ENTRY");
        String lower = name.toLowerCase(Locale.ROOT);
        for (String part : lower.split("/")) {
            if (part.equals(".env") || part.startsWith(".env.") || part.equals(".git") || part.equals("credentials")
                || part.equals("id_rsa") || part.equals("id_ed25519") || part.endsWith(".pem") || part.endsWith(".p12")
                || part.endsWith(".pfx") || part.endsWith(".sqlite") || part.endsWith(".sqlite3") || part.endsWith(".db")) throw new Refused("PRIVATE_FILE_IN_PUBLIC_ARCHIVE");
        }
        // Public archives contain dog artwork and its production notes, never server releases.
        if (!name.endsWith("/") && !lower.equals("index.html") && !lower.matches(".*\\.(?:png|svg|gif|webp|aseprite|json|md|txt|csv|sha256)$"))
            throw new Refused("NON_MEDIA_FILE_IN_ART_ARCHIVE");
    }

    static void validateArchive(Path source) throws IOException {
        int count = 0; long total = 0;
        Set<String> names = new HashSet<>();
        try (ZipFile zip = new ZipFile(source.toFile())) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                validateArchiveEntry(entry.getName(), entry.getSize());
                if (!names.add(entry.getName())) throw new Refused("DUPLICATE_ARCHIVE_ENTRY");
                if (++count > 10000 || (total += entry.getSize()) > 4L * 1024 * 1024 * 1024) throw new Refused("ARCHIVE_CONTENTS_TOO_LARGE");
            }
        }
        if (count == 0) throw new Refused("EMPTY_OR_INVALID_ARCHIVE");
    }

    static void validateSidecar(String text, Asset target) {
        if (target == null || !text.strip().equalsIgnoreCase(target.sha256() + "  " + target.source().getFileName())) throw new Refused("CHECKSUM_SIDECAR_MISMATCH");
    }

    static Digest digest(Path source) throws Exception {
        try (InputStream input = Files.newInputStream(source)) { return digest(input, MAX_FILE_BYTES); }
    }

    static Digest digest(InputStream input, long limit) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024]; long bytes = 0; int length;
        while ((length = input.read(buffer)) != -1) {
            bytes += length;
            if (bytes > limit) throw new Refused("BODY_EXCEEDS_EXPECTED_SIZE");
            hash.update(buffer, 0, length);
        }
        byte[] value = hash.digest();
        return new Digest(bytes, HexFormat.of().formatHex(value), Base64.getEncoder().encodeToString(value));
    }

    private static HeadObjectResponse head(S3Client client, String bucket, String key) {
        try { return client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).checksumMode(ChecksumMode.ENABLED).build()); }
        catch (S3Exception error) { if (error.statusCode() == 404) return null; throw error; }
    }

    static void verifyHead(HeadObjectResponse head, Asset asset) {
        if (!Objects.equals(head.contentLength(), asset.size()) || !asset.contentType().equals(head.contentType())
            || !asset.disposition().equals(head.contentDisposition()) || !CACHE.equals(head.cacheControl())
            || !asset.checksum().equals(head.checksumSHA256()) || !asset.sha256().equals(head.metadata().get("sha256"))) throw new Refused("REMOTE_DOWNLOAD_METADATA_OR_CHECKSUM_MISMATCH");
    }

    private static void verifyCdn(String cdn, Asset asset) throws Exception {
        var connection = (HttpsURLConnection) URI.create(cdn + "/" + asset.path()).toURL().openConnection();
        connection.setRequestMethod("GET"); connection.setConnectTimeout(15000); connection.setReadTimeout(60000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new Refused("CDN_HTTP_" + status);
            if (!asset.contentType().equals(Objects.toString(connection.getContentType(), "").split(";", 2)[0].strip())) throw new Refused("CDN_CONTENT_TYPE_MISMATCH");
            if (!asset.disposition().equals(connection.getHeaderField("Content-Disposition"))) throw new Refused("CDN_CONTENT_DISPOSITION_MISMATCH");
            if (!Objects.toString(connection.getHeaderField("Cache-Control"), "").contains("immutable")) throw new Refused("CDN_CACHE_CONTROL_MISMATCH");
            try (InputStream input = connection.getInputStream()) {
                Digest body = digest(input, asset.size());
                if (body.bytes() != asset.size() || !body.hex().equals(asset.sha256())) throw new Refused("CDN_BODY_CHECKSUM_MISMATCH");
            }
        } finally { connection.disconnect(); }
    }

    static String cdnBase(String configured, String keyBase, String originPath) {
        URI cdn = URI.create(configured.replaceAll("/+$", ""));
        if (!"https".equals(cdn.getScheme()) || cdn.getHost() == null || cdn.getUserInfo() != null || cdn.getQuery() != null || cdn.getFragment() != null
            || !cdn.getPath().matches("(?:/[A-Za-z0-9_-]+)*")) throw new Refused("INVALID_CDN_BASE");
        if (!originPath.isEmpty() && (!originPath.matches("[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*") || !keyBase.startsWith(originPath + "/"))) throw new Refused("CDN_ORIGIN_PATH_NOT_AN_EXACT_KEY_PREFIX");
        return cdn + "/" + (originPath.isEmpty() ? keyBase : keyBase.substring(originPath.length() + 1));
    }

    private static Set<String> allowedPaths() {
        return Set.of("downloads/PuppyRuby.exe", "downloads/PuppyRuby-Setup.exe", "downloads/PuppyRuby.sha256", "downloads/PuppyRuby-Setup.sha256");
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

    private static String verification(String release, int uploaded, int skipped, int count, List<String> verified) {
        return "{\n  \"success\": true,\n  \"verifiedAt\": " + quote(Instant.now().toString()) + ",\n  \"release\": " + quote(release)
            + ",\n  \"uploaded\": " + uploaded + ",\n  \"alreadyPresent\": " + skipped + ",\n  \"s3Verified\": " + count
            + ",\n  \"checksumAndMetadataMatch\": true,\n  \"cdnBodyVerified\": [" + String.join(", ", verified.stream().map(SiteDownloadPublisher::quote).toList()) + "]\n}\n";
    }
    private static String required(String key) { String value = System.getenv(key); if (value == null || value.isBlank()) throw new Refused("REQUIRED_SETTING_MISSING"); return value.strip(); }
    private static String quote(String value) { return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t") + "\""; }
    private static final class Refused extends RuntimeException { final String code; Refused(String code) { this.code = code; } }
}
