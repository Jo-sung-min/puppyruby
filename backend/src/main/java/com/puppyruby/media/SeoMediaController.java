package com.puppyruby.media;

import com.puppyruby.auth.AuthService;
import org.springframework.web.bind.annotation.*;

/** Public share images are issued only by an authenticated, verified administrator. */
@RestController
@RequestMapping("/api/v1/admin/seo-media")
public class SeoMediaController {
    private final MediaService media;
    private final AuthService auth;

    public SeoMediaController(MediaService media, AuthService auth) { this.media = media; this.auth = auth; }

    @GetMapping("/config")
    public MediaService.Config config(@RequestHeader(value = "X-Session-Token", required = false) String session) {
        auth.requireAdmin(session);
        return media.config();
    }

    @PostMapping("/presign")
    public MediaService.Presigned presign(@RequestHeader(value = "X-Session-Token", required = false) String session,
                                         @RequestBody MediaService.Input input) {
        return media.presignSeo(auth.requireAdmin(session).playerId, input);
    }

    @PostMapping("/complete")
    public MediaService.SeoCompleted complete(@RequestHeader(value = "X-Session-Token", required = false) String session,
                                            @RequestBody MediaService.Complete input) {
        return media.completeSeo(auth.requireAdmin(session).playerId, input);
    }
}
