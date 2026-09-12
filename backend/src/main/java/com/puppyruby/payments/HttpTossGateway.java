package com.puppyruby.payments;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

@Component
final class HttpTossGateway implements TossGateway {
    static final URI PROVIDER = URI.create("https://api.tosspayments.com/v1/payments/");
    private static final int MAX_BYTES = 262_144;
    private final PaymentSettings settings;
    private final ObjectMapper mapper;
    private final HttpClient client;
    private final URI base;
    @Autowired
    HttpTossGateway(PaymentSettings settings, ObjectMapper mapper) { this(settings, mapper, PROVIDER); }
    // Package-private injection for isolated loopback HTTP tests; no environment URL override exists.
    HttpTossGateway(PaymentSettings settings, ObjectMapper mapper, URI base) {
        this.settings = settings; this.mapper = mapper; this.base = base;
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    }
    @Override public Payment get(String paymentKey) {
        return request(HttpRequest.newBuilder(base.resolve(pathKey(paymentKey))).GET());
    }
    @Override public Payment confirm(String paymentKey, String orderId, int amount, String idempotencyKey) {
        pathKey(paymentKey);
        return request(HttpRequest.newBuilder(base.resolve("confirm"))
            .header("Idempotency-Key", idempotencyKey)
            .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(Map.of("paymentKey", paymentKey, "orderId", orderId, "amount", amount)))));
    }
    private Payment request(HttpRequest.Builder builder) {
        settings.requireEnabled();
        try {
            var request = builder.timeout(Duration.ofSeconds(12)).header("Authorization", settings.authorization())
                .header("Content-Type", "application/json").header("Accept", "application/json").build();
            var future = client.sendAsync(request, ignored -> new LimitedBody());
            HttpResponse<byte[]> response;
            try { response = future.get(15, TimeUnit.SECONDS); }
            catch (InterruptedException interrupted) { future.cancel(true); Thread.currentThread().interrupt(); throw new Failure(false); }
            catch (ExecutionException | TimeoutException incomplete) { future.cancel(true); throw new Failure(false); }
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new Failure(response.statusCode() == 404);
            return parse(mapper.readTree(response.body()));
        } catch (Failure safe) { throw safe;
        } catch (RuntimeException failure) { throw new Failure(false); }
    }
    static String pathKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,200}")) throw new Failure(false);
        return key;
    }
    private Payment parse(JsonNode json) {
        if (!json.isObject()) throw new Failure(false);
        Long approvedAt = null;
        String timestamp = value(json, "approvedAt");
        if (timestamp != null) approvedAt = OffsetDateTime.parse(timestamp).toInstant().toEpochMilli();
        List<Cancel> cancels = new ArrayList<>();
        JsonNode events = json.path("cancels");
        if (!events.isMissingNode() && !events.isNull()) {
            if (!events.isArray() || events.size() > 2000) throw new Failure(false);
            for (JsonNode cancel : events) cancels.add(new Cancel(integer(cancel, "cancelAmount"), value(cancel, "cancelStatus"), value(cancel, "transactionKey")));
        }
        return new Payment(value(json, "paymentKey"), value(json, "orderId"), integer(json, "totalAmount"), integer(json, "balanceAmount"),
            value(json, "currency"), value(json, "method"), value(json.path("easyPay"), "provider"), value(json, "status"),
            approvedAt, value(json.path("receipt"), "url"), List.copyOf(cancels));
    }
    private static int integer(JsonNode json, String key) {
        JsonNode number = json.path(key);
        if (!number.isIntegralNumber() || !number.canConvertToInt()) throw new Failure(false);
        return number.intValue();
    }
    static String value(JsonNode json, String key) { JsonNode value = json.path(key); return value.isTextual() ? value.asText() : null; }
    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(Long.MAX_VALUE); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                int count = buffer.remaining();
                if (bytes.size() + count > MAX_BYTES) { subscription.cancel(); result.completeExceptionally(new Failure(false)); return; }
                byte[] part = new byte[count]; buffer.get(part); bytes.writeBytes(part);
            }
        }
        @Override public void onError(Throwable error) { result.completeExceptionally(new Failure(false)); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
