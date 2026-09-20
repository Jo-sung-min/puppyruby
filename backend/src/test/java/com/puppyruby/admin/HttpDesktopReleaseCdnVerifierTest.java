package com.puppyruby.admin;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class HttpDesktopReleaseCdnVerifierTest {
    static final String RELEASE = "0123456789abcdef";
    static final List<String> NAMES = List.of("PuppyRuby.exe", "PuppyRuby-Setup.exe", "PuppyRuby.sha256", "PuppyRuby-Setup.sha256");

    @Test
    void rangeChecksTheExactFourCdnObjectsWithoutDownloadingTheirBodies() throws Exception {
        try (Fixture fixture = new Fixture("ok", Duration.ofSeconds(2))) {
            assertDoesNotThrow(() -> fixture.verifier.verify(fixture.assets()));
            assertEquals(4, fixture.requests);
        }
    }

    @Test
    void rejectsRedirectStatusRangeHeadersChecksumCacheAndBodyMismatches() throws Exception {
        for (String scenario : List.of("redirect", "status", "range", "length", "type", "type-parameters", "disposition",
            "cache", "cache-no-store", "checksum", "empty-body", "large-body")) {
            try (Fixture fixture = new Fixture(scenario, Duration.ofSeconds(2))) {
                var error = assertThrows(ResponseStatusException.class, () -> fixture.verifier.verify(fixture.assets()), scenario);
                assertEquals(409, error.getStatusCode().value(), scenario);
                assertEquals(1, fixture.requests, scenario);
            }
        }
    }

    @Test
    void boundsNetworkFailuresAndSlowResponses() throws Exception {
        for (String scenario : List.of("io", "timeout")) {
            try (Fixture fixture = new Fixture(scenario, Duration.ofMillis(100))) {
                var error = assertThrows(ResponseStatusException.class, () -> fixture.verifier.verify(fixture.assets()), scenario);
                assertEquals(503, error.getStatusCode().value(), scenario);
            }
        }
    }

    @Test
    void productionUrlValidationRejectsEveryHostPathQueryAndInventoryEscapeBeforeNetwork() {
        URI production = URI.create(DesktopReleaseSettings.CDN_ROOT);
        var valid = productionAssets();
        assertEquals(RELEASE, HttpDesktopReleaseCdnVerifier.exactRelease(valid.getFirst(), production));
        for (String url : List.of(
            "https://example.com/site-downloads/" + RELEASE + "/downloads/PuppyRuby.exe",
            "https://cdn.puppyruby.com.evil.test/site-downloads/" + RELEASE + "/downloads/PuppyRuby.exe",
            "https://cdn.puppyruby.com/site-downloads/" + RELEASE + "/downloads/../PuppyRuby.exe",
            "https://cdn.puppyruby.com/site-downloads/" + RELEASE + "/downloads/PuppyRuby.exe?download=1",
            "https://user@cdn.puppyruby.com/site-downloads/" + RELEASE + "/downloads/PuppyRuby.exe")) {
            var first = valid.getFirst();
            var escaped = new DesktopReleaseCdnVerifier.Asset(first.name(), url, first.size(), first.sha256Hex(),
                first.contentType(), first.contentDisposition(), first.cacheControl());
            assertThrows(IllegalArgumentException.class, () -> HttpDesktopReleaseCdnVerifier.exactRelease(escaped, production), url);
        }
    }

    static List<DesktopReleaseCdnVerifier.Asset> productionAssets() {
        return assets(URI.create(DesktopReleaseSettings.CDN_ROOT));
    }
    static List<DesktopReleaseCdnVerifier.Asset> assets(URI origin) {
        var result = new ArrayList<DesktopReleaseCdnVerifier.Asset>();
        for (int index = 0; index < NAMES.size(); index++) {
            String name = NAMES.get(index);
            result.add(new DesktopReleaseCdnVerifier.Asset(name,
                origin.toString() + "/" + RELEASE + "/downloads/" + name, 1000L + index,
                Integer.toHexString(index).repeat(64), type(name), disposition(name), DesktopReleaseSettings.IMMUTABLE_CACHE));
        }
        return result;
    }
    static String type(String name) { return name.endsWith(".exe") ? DesktopReleaseSettings.EXECUTABLE_TYPE : "text/plain"; }
    static String disposition(String name) { return "attachment; filename=\"" + name + "\""; }

    static final class Fixture implements AutoCloseable {
        final HttpServer server;
        final URI origin;
        final HttpDesktopReleaseCdnVerifier verifier;
        final String scenario;
        volatile int requests;

        Fixture(String scenario, Duration timeout) throws Exception {
            this.scenario = scenario;
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/cdn", this::handle); server.start();
            origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/cdn");
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
                .followRedirects(HttpClient.Redirect.NEVER).build();
            verifier = new HttpDesktopReleaseCdnVerifier(client, origin, timeout);
        }
        List<DesktopReleaseCdnVerifier.Asset> assets() { return HttpDesktopReleaseCdnVerifierTest.assets(origin); }

        void handle(HttpExchange exchange) throws IOException {
            requests++;
            if (scenario.equals("timeout")) {
                try { Thread.sleep(350); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            }
            if (scenario.equals("io")) { exchange.close(); return; }
            if (scenario.equals("redirect")) {
                exchange.getResponseHeaders().set("Location", "https://example.com/"); exchange.sendResponseHeaders(302, -1); exchange.close(); return;
            }
            String name = exchange.getRequestURI().getPath().substring(exchange.getRequestURI().getPath().lastIndexOf('/') + 1);
            int index = NAMES.indexOf(name);
            if (index < 0 || !"bytes=0-0".equals(exchange.getRequestHeaders().getFirst("Range"))
                || !"identity".equals(exchange.getRequestHeaders().getFirst("Accept-Encoding"))) {
                exchange.sendResponseHeaders(400, -1); exchange.close(); return;
            }
            long total = 1000L + index;
            exchange.getResponseHeaders().set("Content-Range", scenario.equals("range") ? "bytes 0-1/" + total : "bytes 0-0/" + total);
            exchange.getResponseHeaders().set("Content-Type", scenario.equals("type") ? "text/html"
                : scenario.equals("type-parameters") ? type(name) + "; charset=utf-8" : type(name));
            exchange.getResponseHeaders().set("Content-Disposition", scenario.equals("disposition") ? "inline" : disposition(name));
            String cache = scenario.equals("cache") ? "public, max-age=60, immutable"
                : scenario.equals("cache-no-store") ? "no-store, immutable" : DesktopReleaseSettings.IMMUTABLE_CACHE;
            exchange.getResponseHeaders().set("Cache-Control", cache);
            exchange.getResponseHeaders().set("X-Amz-Meta-Sha256", scenario.equals("checksum") ? "f".repeat(64) : Integer.toHexString(index).repeat(64));
            int status = scenario.equals("status") ? 200 : 206;
            byte[] body = scenario.equals("empty-body") ? new byte[0] : scenario.equals("large-body") ? new byte[] {1, 2} : new byte[] {1};
            long declared = scenario.equals("length") ? 2 : body.length;
            exchange.sendResponseHeaders(status, declared);
            if (body.length > 0) exchange.getResponseBody().write(body);
            exchange.close();
        }
        @Override public void close() { server.stop(0); }
    }
}
