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
    private static String phase = "plan", currentPath = "";
    record Asset(Path source, String path, String contentType, String disposition, long size, String sha256, String checksum) {}
    record Digest(long bytes, String hex, String base64) {}

    /** Only this independently published subtree is excluded; other unknown files still fail validation. */
    static List<Path> collectSources(Path publicRoot) throws IOException {
        Path downloads = publicRoot.resolve("downloads"), independent = downloads.resolve("ruby-round-v1");
        var sources = new ArrayList<Path>();
        Files.walkFileTree(downloads, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) {
                if (directory.equals(independent)) return FileVisitResult.SKIP_SUBTREE;
                sources.add(directory); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                if (!file.equals(independent)) sources.add(file);
                return FileVisitResult.CONTINUE;
            }
        });
        return sources;
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
        StringBuilder canonical = new StringBuilder();
        for (Asset asset : assets) canonical.append(asset.path()).append('\t').append(asset.contentType()).append('\t').append(asset.disposition())
            .append('\t').append(CACHE).append('\t').append(asset.size()).append('\t').append(asset.sha256()).append('\n');
        String manifestHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        String release = manifestHash.substring(0, 16);
        String bucket = required("S3_BUCKET"), region = required("AWS_REGION"), prefix = required("S3_KEY_PREFIX").replaceAll("/+$", "");
        if (!bucket.equals("fatell-aws-s3") || !prefix.equals("puppyruby")) throw new Refused("DESTINATION_OUTSIDE_AUTHORIZED_SCOPE");
        if (!region.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]")) throw new Refused("INVALID_REGION");
        String keyBase = prefix + "/site-downloads/" + release;
        String originPath = System.getenv().getOrDefault("CDN_ORIGIN_PATH", "").strip().replaceAll("^/+|/+$", "");
        String cdnBase = cdnBase(required("CDN_BASE_URL"), keyBase, originPath);
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
        currentPath = "";
        System.out.println("DOWNLOAD_PUBLISH_SUCCESS=true UPLOADED=" + uploaded + " EXISTING=" + skipped + " S3_VERIFIED=" + assets.size() + " CDN_VERIFIED=" + verified.size());
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
        if (ALLOWED_PATHS.size() != 188 || !Collections.disjoint(ALLOWED_PATHS, EXCLUDED_SERVER_PATHS) || !paths.equals(ALLOWED_PATHS))
            throw new Refused("DOWNLOAD_COLLECTION_REQUIRES_EXACTLY_188_PUBLIC_FILES_WITHOUT_SERVER_ARTIFACTS");
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
        Set<String> paths = new HashSet<>();
        for (String name : List.of("PuppyRuby.exe", "PuppyRuby-Setup.exe", "PuppyRuby.sha256", "PuppyRuby-Setup.sha256",
            "puppyruby-art16-breed-scenes.zip", "puppyruby-cute-puppies-16.zip", "puppyruby-imaginary-pixel-12.zip", "puppyruby-pixel-art-30.zip", "puppyruby-pixel-art-dogs-30.zip", "puppyruby-premium-puppies-12.zip", "puppyruby-soft-pixel-candidates.zip", "puppyruby-sp08-breed-scenes.zip", "puppyruby-sp15-breed-scenes.zip")) paths.add("downloads/" + name);
        for (String breed : BreedCatalog.IDS) {
            paths.add("downloads/art16-scenes-v1/" + breed + ".aseprite");
            for (String style : List.of("sp08", "sp15")) paths.add("downloads/sp-scenes-v1/" + style + "/" + breed + ".aseprite");
        }
        for (String family : List.of("cozy", "bean", "bright", "button")) for (String body : List.of("chubby", "slim", "tall", "loaf")) paths.add("downloads/cute-puppies-v1/" + family + "-" + body + ".aseprite");
        for (String name : List.of("marshmallow", "milkbean", "honeybun", "cloudpuff", "biscuit", "naploaf", "teddycub", "peachcheek", "buttonpaw", "rounddrop", "cottonball", "caramel")) paths.add("downloads/premium-puppies-v1/premium-" + name + ".aseprite");
        for (int i = 1; i <= 12; i++) paths.add("downloads/imaginary-pixel-v1/C%02d.aseprite".formatted(i));
        for (int i = 1; i <= 30; i++) paths.add("downloads/pixel-art-dogs-v1/art-%02d.aseprite".formatted(i));
        for (int i = 1; i <= 15; i++) paths.add("downloads/soft-pixel-v1/sp-%02d.aseprite".formatted(i));
        return Set.copyOf(paths);
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
