package com.puppyruby.walk;

import com.puppyruby.auth.AuthService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/walk")
public class WalkController {
    private final WalkService service;
    private final AuthService auth;
    public WalkController(WalkService service, AuthService auth) { this.service = service; this.auth = auth; }
    @GetMapping
    public WalkService.State state(@RequestHeader("X-Player-Id") String playerId,
                                  @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return service.state(auth.resolvePlayer(session, playerId));
    }
    @PostMapping("/{action}")
    public WalkService.Result act(@RequestHeader("X-Player-Id") String playerId, @PathVariable String action,
                                  @RequestBody WalkService.Action input,
                                  @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return service.act(auth.resolvePlayer(session, playerId), action, input);
    }
}
