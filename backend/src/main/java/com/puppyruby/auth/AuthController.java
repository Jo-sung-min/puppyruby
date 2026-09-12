package com.puppyruby.auth;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    public AuthController(AuthService auth) { this.auth = auth; }
    @GetMapping("/me") public AuthService.Me me(@RequestHeader(value = "X-Session-Token", required = false) String session) { return auth.me(session); }
    @PostMapping("/register") public AuthService.AuthResult register(@RequestHeader(value = "X-Player-Id", required = false) String guest, @RequestBody AuthService.Register input) { return auth.register(guest, input); }
    @PostMapping("/login") public AuthService.AuthResult login(@RequestBody AuthService.Login input) { return auth.login(input); }
    @PostMapping("/logout") public AuthService.Message logout(@RequestHeader(value = "X-Session-Token", required = false) String session) { return auth.logout(session); }
    @PostMapping("/profile") public AuthService.ProfileResult profile(@RequestHeader(value = "X-Session-Token", required = false) String session, @RequestBody AuthService.Profile input) { return auth.profile(session, input); }
    @PostMapping("/password") public AuthService.PasswordResult password(@RequestHeader(value = "X-Session-Token", required = false) String session, @RequestBody AuthService.Password input) { return auth.password(session, input); }
    @PostMapping("/verify-email/request") public AuthService.Message requestVerification(@RequestHeader(value = "X-Session-Token", required = false) String session) { return auth.requestVerification(session); }
    @PostMapping("/verify-email/confirm") public AuthService.Message confirmVerification(@RequestBody AuthService.Token input) { return auth.confirmVerification(input); }
    @PostMapping("/password-reset/request") public AuthService.Message requestReset(@RequestBody AuthService.Email input) { return auth.requestReset(input); }
    @PostMapping("/password-reset/confirm") public AuthService.Message confirmReset(@RequestBody AuthService.Reset input) { return auth.confirmReset(input); }
    @PostMapping("/kakao") public AuthService.AuthResult kakao(@RequestHeader(value = "X-Player-Id", required = false) String guest, @RequestBody AuthService.Kakao input) { return auth.kakao(guest, input); }
}
