package com.puppyruby.media;

import com.puppyruby.auth.AuthService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/media")
public class MediaController {
    private final MediaService media;
    private final AuthService auth;
    public MediaController(MediaService media, AuthService auth) { this.media = media; this.auth = auth; }

    @GetMapping("/config") public MediaService.Config config() { return media.config(); }

    @PostMapping("/presign")
    public MediaService.Presigned presign(@RequestHeader(value = "X-Session-Token", required = false) String session,
                                         @RequestBody MediaService.Input input) {
        return media.presign(auth.requireAccount(session).playerId, input);
    }

    @PostMapping("/complete")
    public MediaService.Completed complete(@RequestHeader(value = "X-Session-Token", required = false) String session,
                                          @RequestBody MediaService.Complete input) {
        return media.complete(auth.requireAccount(session).playerId, input);
    }
}
