package com.puppyruby.game;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/game")
public class GameController {
    private final GameService service;
    public GameController(GameService service) { this.service = service; }
    @GetMapping
    public GameService.State state(@RequestHeader("X-Player-Id") String playerId) { return service.state(playerId); }
    @PostMapping("/{action}")
    public GameService.Result act(@RequestHeader("X-Player-Id") String playerId, @PathVariable String action,
                                 @RequestBody GameService.Action input) { return service.act(playerId, action, input); }
}
