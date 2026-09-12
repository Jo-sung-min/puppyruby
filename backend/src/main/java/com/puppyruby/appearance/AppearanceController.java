package com.puppyruby.appearance;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppearanceController {
    private final AppearanceService service;
    AppearanceController(AppearanceService service) { this.service = service; }
    @GetMapping("/api/v1/appearance")
    public ResponseEntity<AppearanceService.Config> current() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current());
    }
}
