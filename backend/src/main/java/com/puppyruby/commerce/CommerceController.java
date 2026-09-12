package com.puppyruby.commerce;

import com.puppyruby.game.GameService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1/commerce")
public class CommerceController {
    private final CommerceService service;
    private final CommerceCatalogService catalog;
    CommerceController(CommerceService service, CommerceCatalogService catalog) { this.service = service; this.catalog = catalog; }
    @GetMapping("/catalog") public ResponseEntity<CommerceCatalogService.Catalog> catalog() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(catalog.current()); }
    @GetMapping("/me") public ResponseEntity<CommerceService.Wallet> me(@RequestHeader(value = "X-Session-Token", required = false) String token) { return privateResponse(service.me(token)); }
    @PostMapping("/draw") public ResponseEntity<CommerceService.DrawResult> draw(@RequestHeader(value = "X-Session-Token", required = false) String token, @RequestBody(required = false) Map<String, Object> body) { return privateResponse(service.draw(token, body)); }
    @PostMapping("/equip") public ResponseEntity<GameService.Result> equip(@RequestHeader(value = "X-Session-Token", required = false) String token, @RequestBody(required = false) Map<String, Object> body) { return privateResponse(service.equip(token, body)); }
    private static <T> ResponseEntity<T> privateResponse(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary", "X-Session-Token").body(body); }
}
