package com.puppyruby.admin;

import com.puppyruby.appearance.AppearanceService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/appearance")
public class AdminAppearanceController {
    private final AdminAppearanceService service;
    AdminAppearanceController(AdminAppearanceService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<AppearanceService.Config> current(@RequestHeader(value = "X-Session-Token", required = false) String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current(token));
    }
    @PostMapping
    public ResponseEntity<AppearanceService.Config> save(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                                        @RequestBody(required = false) Map<String, Object> input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.save(token, input));
    }
}
