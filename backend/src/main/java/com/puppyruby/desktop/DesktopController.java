package com.puppyruby.desktop;

import com.puppyruby.auth.AuthService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/desktop")
public class DesktopController {
    private final DesktopService service;
    private final AuthService auth;
    public DesktopController(DesktopService service, AuthService auth) { this.service = service; this.auth = auth; }

    @GetMapping("/links")
    public ResponseEntity<DesktopService.Links> links(@RequestHeader("X-Player-Id") String playerId,
                                                     @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return response(service.links(auth.resolvePlayer(session, playerId)));
    }
    @PostMapping("/pair-code")
    public ResponseEntity<DesktopService.PairCode> pairCode(@RequestHeader("X-Player-Id") String playerId,
                                                          @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return response(service.pairCode(auth.resolvePlayer(session, playerId)));
    }
    @PostMapping("/revoke")
    public ResponseEntity<DesktopService.Links> revoke(@RequestHeader("X-Player-Id") String playerId,
                                                      @RequestBody DesktopService.RevokeInput input,
                                                      @RequestHeader(value = "X-Session-Token", required = false) String session) {
        return response(service.revoke(auth.resolvePlayer(session, playerId), input));
    }
    @PostMapping("/pair")
    public ResponseEntity<DesktopService.PairResult> pair(@RequestBody DesktopService.PairInput input) {
        return response(service.pair(input));
    }
    @GetMapping("/state")
    public ResponseEntity<DesktopService.State> state(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return response(service.state(bearer(authorization)));
    }
    @PostMapping("/action")
    public ResponseEntity<DesktopService.Result> act(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                    @RequestBody DesktopService.Action input) {
        return response(service.act(bearer(authorization), input));
    }

    private static String bearer(String authorization) {
        return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
    }
    private static <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
