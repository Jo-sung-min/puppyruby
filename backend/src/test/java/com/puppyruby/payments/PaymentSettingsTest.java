package com.puppyruby.payments;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PaymentSettingsTest {
    String key(String prefix) { return prefix + UUID.randomUUID().toString().replace("-", ""); }
    @Test void keysMustBeMatchingPairsAndLiveRequiresExplicitOptIn() {
        String tc = key("test_ck_"), ts = key("test_sk_"), lc = key("live_ck_"), ls = key("live_sk_");
        for (PaymentSettings settings : List.of(new PaymentSettings("", "", false, "https://example.test"),
            new PaymentSettings(tc, "", false, "https://example.test"), new PaymentSettings(tc, ls, true, "https://example.test"),
            new PaymentSettings(lc, ts, true, "https://example.test"), new PaymentSettings(lc, ls, false, "https://example.test"),
            new PaymentSettings(tc + "\ninvalid", ts, false, "https://example.test"))) {
            assertFalse(settings.config().enabled()); assertEquals("disabled", settings.config().mode()); assertNull(settings.config().clientKey());
        }
        assertEquals("test", new PaymentSettings(tc, ts, false, "http://127.0.0.1:3001").config().mode());
        assertEquals("live", new PaymentSettings(lc, ls, true, "https://example.test").config().mode());
    }
    @Test void siteRequiresHttpsOrExplicitLoopbackOriginAndRejectsCredentialsAndRedirectPaths() {
        for (String valid : List.of("https://shop.example", "http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001/")) assertTrue(PaymentSettings.validSite(valid), valid);
        for (String invalid : List.of("http://shop.example", "https://user:secret@shop.example", "https://shop.example/pay", "https://shop.example?next=x", "https://shop.example#pay", "http://127.0.0.1.evil.test", "file:///etc/passwd", "https://shop.example:0")) {
            assertFalse(PaymentSettings.validSite(invalid), invalid);
            assertFalse(new PaymentSettings(key("test_ck_"), key("test_sk_"), false, invalid).config().enabled());
        }
    }
    @Test void onlyProviderHttpsReceiptsAreExposed() {
        assertNotNull(PaymentService.safeReceipt("https://dashboard.tosspayments.com/receipt?id=1"));
        for (String invalid : List.of("javascript:alert(1)", "http://dashboard.tosspayments.com/receipt", "https://tosspayments.com.evil.test/receipt", "https://name@dashboard.tosspayments.com/receipt", "https://evil.test/receipt")) assertNull(PaymentService.safeReceipt(invalid));
    }
}
