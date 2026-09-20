package com.puppyruby.admin;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/desktop-release")
public class DesktopReleaseController {
    private final DesktopReleaseService service;
    public DesktopReleaseController(DesktopReleaseService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<DesktopReleaseService.Config> current(
        @RequestHeader(value = "X-Session-Token", required = false) String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.current(token));
    }

    @PostMapping("/prepare")
    public ResponseEntity<DesktopReleaseService.Prepared> prepare(
        @RequestHeader(value = "X-Session-Token", required = false) String token,
        @RequestBody(required = false) DesktopReleaseService.PrepareInput input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.prepare(token, input));
    }

    @PostMapping("/complete")
    public ResponseEntity<DesktopReleaseService.Manifest> complete(
        @RequestHeader(value = "X-Session-Token", required = false) String token,
        @RequestBody(required = false) DesktopReleaseService.CompleteInput input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.complete(token, input));
    }
}
