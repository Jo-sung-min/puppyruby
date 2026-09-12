package com.puppyruby.payments;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {
    private final PaymentService payments;
    public PaymentController(PaymentService payments) { this.payments = payments; }
    @GetMapping("/config") public PaymentSettings.Config config() { return payments.config(); }
    @PostMapping("/orders") public PaymentService.Created create(@RequestHeader(value = "X-Session-Token", required = false) String session, @RequestBody PaymentService.Create input) { return payments.create(session, input); }
    @GetMapping("/orders") public PaymentService.History history(@RequestHeader(value = "X-Session-Token", required = false) String session) { return payments.history(session); }
    @PostMapping("/confirm") public PaymentService.Result confirm(@RequestHeader(value = "X-Session-Token", required = false) String session, @RequestBody PaymentService.Confirm input) { return payments.confirm(session, input); }
    @PostMapping("/orders/{id}/reconcile") public PaymentService.Result reconcile(@RequestHeader(value = "X-Session-Token", required = false) String session, @PathVariable String id) { return payments.reconcile(session, id); }
    @PostMapping(value = "/webhook", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PaymentService.Message webhook(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > 32_768) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "웹훅 본문이 너무 커요.");
        byte[] bytes = request.getInputStream().readNBytes(32_769);
        if (bytes.length > 32_768) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "웹훅 본문이 너무 커요.");
        return payments.webhook(bytes);
    }
}
