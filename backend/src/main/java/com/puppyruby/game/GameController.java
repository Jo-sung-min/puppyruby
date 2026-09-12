package com.puppyruby.game;

import com.puppyruby.auth.AuthService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/game")
public class GameController {
    private final GameService service;
    private final AuthService auth;
    public GameController(GameService service, AuthService auth) { this.service = service; this.auth = auth; }
    @GetMapping
    public GameService.State state(@RequestHeader("X-Player-Id") String playerId,
                                   @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return service.state(auth.resolvePlayer(session, playerId));
    }
    @PostMapping("/{action}")
    public GameService.Result act(@RequestHeader("X-Player-Id") String playerId, @PathVariable String action,
                                 @RequestBody GameService.Action input,
                                 @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return service.act(auth.resolvePlayer(session, playerId), action, input);
    }
}
