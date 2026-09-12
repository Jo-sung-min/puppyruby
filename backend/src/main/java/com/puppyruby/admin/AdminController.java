package com.puppyruby.admin;

import com.puppyruby.walk.WalkAdminService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
    private final AdminService service;
    public AdminController(AdminService service) { this.service = service; }
    public record StatusInput(String status, String reason) {}
    public record ReasonInput(String reason) {}

    @GetMapping("/overview")
    public AdminService.Overview overview(@RequestHeader(value = "X-Session-Token", required = false) String token) {
        return service.overview(token);
    }
    @GetMapping("/members")
    public AdminService.Members members(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                       @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "") String query) {
        return service.members(token, page, query);
    }
    @PostMapping("/members/{id}/status")
    public AdminService.Result status(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                      @PathVariable String id, @RequestBody StatusInput input) {
        return service.status(token, id, input.status(), input.reason());
    }
    @GetMapping("/rooms")
    public WalkAdminService.Items<WalkAdminService.Room> rooms(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                                             @RequestParam(defaultValue = "0") int page) {
        return service.rooms(token, page);
    }
    @GetMapping("/rooms/{id}/messages")
    public WalkAdminService.Items<WalkAdminService.Message> messages(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                                                   @PathVariable String id, @RequestParam(defaultValue = "0") int page) {
        return service.messages(token, id, page);
    }
    @PostMapping("/rooms/{id}/close")
    public AdminService.Result closeRoom(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                         @PathVariable String id, @RequestBody ReasonInput input) {
        return service.closeRoom(token, id, input.reason());
    }
    @PostMapping("/messages/{id}/hide")
    public AdminService.Result hideMessage(@RequestHeader(value = "X-Session-Token", required = false) String token,
                                           @PathVariable String id, @RequestBody ReasonInput input) {
        return service.hideMessage(token, id, input.reason());
    }
}
