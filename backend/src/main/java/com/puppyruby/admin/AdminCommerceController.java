package com.puppyruby.admin;

import com.puppyruby.commerce.CommerceCatalogService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1/admin/commerce/catalog")
public class AdminCommerceController {
    private final AdminCommerceService service;
    AdminCommerceController(AdminCommerceService service) { this.service = service; }
    @GetMapping public ResponseEntity<CommerceCatalogService.Catalog> current(@RequestHeader(value = "X-Session-Token", required = false) String token) { return response(service.current(token)); }
    @PostMapping public ResponseEntity<CommerceCatalogService.Catalog> save(@RequestHeader(value = "X-Session-Token", required = false) String token, @RequestBody(required = false) Map<String, Object> body) { return response(service.save(token, body)); }
    private static ResponseEntity<CommerceCatalogService.Catalog> response(CommerceCatalogService.Catalog body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary", "X-Session-Token").body(body); }
}
