package com.puppyruby.payments;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real Java HTTP adapter, isolated loopback provider; never contacts or approves a real payment. */
class HttpTossGatewayTest {
    HttpServer server;
    URI base;
    ObjectMapper mapper = new ObjectMapper();
    String secret = "test_sk_" + UUID.randomUUID().toString().replace("-", "");
    PaymentSettings settings;
    @BeforeEach void setup() throws Exception {
        settings = new PaymentSettings("test_ck_" + UUID.randomUUID().toString().replace("-", ""), secret, false, "http://127.0.0.1:3001");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); server.start();
        base = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1/payments/");
    }
    @AfterEach void stop() { server.stop(0); }
    String json() { return mapper.writeValueAsString(Map.of("paymentKey", "test_payment", "orderId", "ruby_test_order", "totalAmount", 1500, "balanceAmount", 1500,
        "currency", "KRW", "method", "간편결제", "easyPay", Map.of("provider", "토스페이"), "status", "DONE", "approvedAt", "2026-09-12T10:00:00+09:00")); }
    @Test void confirmationUsesBasicColonHeaderStableIdempotencyAndStoredIntegerAmount() {
        AtomicReference<String> authorization = new AtomicReference<>(), requestId = new AtomicReference<>(), requestBody = new AtomicReference<>();
        server.createContext("/v1/payments/confirm", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization")); requestId.set(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = json().getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        String id = UUID.randomUUID().toString(); var result = new HttpTossGateway(settings, mapper, base).confirm("test_payment", "ruby_test_order", 1500, id);
        assertEquals("Basic " + Base64.getEncoder().encodeToString((secret + ":").getBytes(StandardCharsets.UTF_8)), authorization.get());
        assertEquals(id, requestId.get()); assertEquals(1500, mapper.readTree(requestBody.get()).path("amount").intValue());
        assertEquals("토스페이", result.provider()); assertEquals("DONE", result.status()); assertNotNull(result.approvedAt());
    }
    @Test void providerRedirectsAreRejectedWithoutForwardingCredentials() {
        AtomicInteger redirected = new AtomicInteger();
        server.createContext("/v1/payments/test_payment", exchange -> { exchange.getResponseHeaders().add("Location", base.resolve("leak").toString()); exchange.sendResponseHeaders(302, -1); exchange.close(); });
        server.createContext("/v1/payments/leak", exchange -> { redirected.incrementAndGet(); exchange.sendResponseHeaders(500, -1); exchange.close(); });
        assertThrows(TossGateway.Failure.class, () -> new HttpTossGateway(settings, mapper, base).get("test_payment")); assertEquals(0, redirected.get());
    }
    @Test void oversizedAndMalformedProviderBodiesAreRejectedAndErrorTextNeverEscapes() {
        AtomicInteger mode = new AtomicInteger();
        server.createContext("/v1/payments/test_payment", exchange -> {
            String body = switch (mode.get()) { case 0 -> "x".repeat(262_145); case 1 -> "{bad"; case 2 -> json().replace("1500", "1500.5"); default -> secret; };
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(mode.get() == 3 ? 500 : 200, bytes.length);
            try { exchange.getResponseBody().write(bytes); } finally { exchange.close(); }
        });
        for (int index = 0; index < 4; index++) {
            mode.set(index); var failure = assertThrows(TossGateway.Failure.class, () -> new HttpTossGateway(settings, mapper, base).get("test_payment"));
            assertFalse(failure.getMessage().contains(secret));
        }
    }
    @Test void pathKeysCannotInjectAHostOrQuery() {
        for (String invalid : List.of("https://evil.test", "../secret", "key?x=y", "key#x", "key\r\nHeader:value", "x".repeat(201)))
            assertThrows(TossGateway.Failure.class, () -> new HttpTossGateway(settings, mapper, base).get(invalid));
    }
}
