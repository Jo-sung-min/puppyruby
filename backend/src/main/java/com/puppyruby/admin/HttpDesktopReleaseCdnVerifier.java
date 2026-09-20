package com.puppyruby.admin;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class HttpDesktopReleaseCdnVerifier implements DesktopReleaseCdnVerifier {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);
    private static final URI PRODUCTION_ORIGIN = URI.create(DesktopReleaseSettings.CDN_ROOT);
    private static final Set<String> NAMES = Set.of("PuppyRuby.exe", "PuppyRuby-Setup.exe",
        "PuppyRuby.sha256", "PuppyRuby-Setup.sha256");
    private final HttpClient client;
    private final URI allowedOrigin;
    private final Duration timeout;

    HttpDesktopReleaseCdnVerifier() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build(), PRODUCTION_ORIGIN, REQUEST_TIMEOUT);
    }
    HttpDesktopReleaseCdnVerifier(HttpClient client, URI allowedOrigin, Duration timeout) {
        this.client = Objects.requireNonNull(client);
        this.allowedOrigin = Objects.requireNonNull(allowedOrigin);
        this.timeout = Objects.requireNonNull(timeout);
        if (allowedOrigin.getScheme() == null || allowedOrigin.getHost() == null || allowedOrigin.getQuery() != null
            || allowedOrigin.getFragment() != null || allowedOrigin.getUserInfo() != null
            || timeout.isNegative() || timeout.isZero() || timeout.compareTo(Duration.ofSeconds(30)) > 0)
            throw new IllegalArgumentException("CDN 검증 연결 설정이 올바르지 않아요.");
    }

    @Override
    public void verify(List<Asset> assets) {
        if (assets == null || assets.size() != 4 || !new HashSet<>(assets.stream().map(Asset::name).toList()).equals(NAMES))
            throw new IllegalArgumentException("CDN 검증 파일 목록이 올바르지 않아요.");
        String release = null;
        for (Asset asset : assets) {
            String current = exactRelease(asset, allowedOrigin);
            if (release == null) release = current;
            else if (!release.equals(current)) throw new IllegalArgumentException("CDN 릴리스 경로가 서로 달라요.");
            verify(asset);
        }
    }

    private void verify(Asset asset) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(asset.url())).timeout(timeout)
                .header("Accept-Encoding", "identity").header("Range", "bytes=0-0")
                .header("User-Agent", "PuppyRuby-Release-Verifier/1").GET().build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() != 206) throw conflict("CDN이 바이트 범위 요청으로 새 릴리스 파일을 확인하지 못했어요.");
                long length = response.headers().firstValueAsLong("Content-Length").orElse(-1);
                String range = response.headers().firstValue("Content-Range").orElse("");
                String type = response.headers().firstValue("Content-Type").orElse("");
                String disposition = response.headers().firstValue("Content-Disposition").orElse("");
                String cache = response.headers().firstValue("Cache-Control").orElse("");
                String checksum = response.headers().firstValue("X-Amz-Meta-Sha256").orElse("");
                if (length != 1 || !range.equals("bytes 0-0/" + asset.size()) || !asset.contentType().equals(type)
                    || !asset.contentDisposition().equals(disposition) || !asset.cacheControl().equals(cache)
                    || !asset.sha256Hex().equals(checksum))
                    throw conflict("CDN 파일의 크기, 체크섬 또는 다운로드 헤더가 S3와 달라요.");
                byte[] probe = body.readNBytes(2);
                if (probe.length != 1) throw conflict("CDN 바이트 범위 응답 본문이 올바르지 않아요.");
            }
        } catch (ResponseStatusException error) { throw error; }
        catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException | RuntimeException error) { throw unavailable(); }
    }

    static String exactRelease(Asset asset, URI allowedOrigin) {
        if (asset == null || asset.name() == null || !NAMES.contains(asset.name()) || asset.size() < 1
            || asset.size() > DesktopReleaseSettings.MAX_FILE_BYTES || asset.sha256Hex() == null
            || !asset.sha256Hex().matches("[a-f0-9]{64}")) throw new IllegalArgumentException("CDN 검증 파일 정보가 올바르지 않아요.");
        String suffix = "/downloads/" + asset.name();
        String prefix = allowedOrigin.toString().replaceAll("/+$", "") + "/";
        if (asset.url() == null || !asset.url().startsWith(prefix) || !asset.url().endsWith(suffix))
            throw new IllegalArgumentException("허용되지 않은 CDN 주소예요.");
        String release = asset.url().substring(prefix.length(), asset.url().length() - suffix.length());
        if (!release.matches("[a-f0-9]{16}") || !asset.url().equals(prefix + release + suffix))
            throw new IllegalArgumentException("허용되지 않은 CDN 주소예요.");
        return release;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CDN 릴리스 파일을 검증할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
}
