package com.puppyruby.admin;

import com.puppyruby.seo.SeoService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/seo")
public class AdminSeoController {
    private final AdminSeoService service;
    AdminSeoController(AdminSeoService service) { this.service = service; }
    @GetMapping public ResponseEntity<SeoService.Config> current(@RequestHeader(value = "X-Session-Token", required = false) String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary", "X-Session-Token").body(service.current(token));
    }
    @PostMapping public ResponseEntity<SeoService.Config> save(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary", "X-Session-Token").body(service.save(token, body));
    }
}
