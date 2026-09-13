package com.puppyruby.seo;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class SeoController {
    private final SeoService service;
    SeoController(SeoService service) { this.service = service; }
    @GetMapping("/api/v1/seo")
    public ResponseEntity<SeoService.Config> current() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current()); }
}
