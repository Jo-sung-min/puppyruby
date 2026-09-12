package com.puppyruby.auth;

import com.puppyruby.game.GameService;
import com.puppyruby.desktop.DesktopService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:auth-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "MAIL_ENABLED=false", "ADMIN_EMAIL=owner@example.com"
})
class AuthServiceTest {
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired AuthSessionRepository sessions;
    @Autowired AuthEmailTokenRepository emailTokens;
    @Autowired GameService game;
    @Autowired DesktopService desktop;
    @Autowired ObjectMapper mapper;
    @MockitoBean AuthMailSender mail;
    @MockitoBean KakaoClient kakao;
    private final String password = "a-good-password-123";
    private AtomicReference<String> delivered;
    @BeforeEach void setup() {
        delivered = new AtomicReference<>();
        when(mail.enabled()).thenReturn(true); doCallRealMethod().when(mail).requireEnabled();
        doAnswer(invocation -> { delivered.set(invocation.getArgument(2)); return null; }).when(mail).send(anyString(), anyBoolean(), anyString());
        when(kakao.enabled()).thenReturn(false);
    }
    String uuid() { return UUID.randomUUID().toString(); }
    String email() { return uuid() + "@example.com"; }
    AuthService.AuthResult register() { return auth.register(uuid(), new AuthService.Register(email(), password, "루비 친구")); }
    void status(int expected, org.junit.jupiter.api.function.Executable action) { assertEquals(expected, assertThrows(ResponseStatusException.class, action).getStatusCode().value()); }
    String mailToken() { String url = Objects.requireNonNull(delivered.get()); return url.substring(url.indexOf("?token=") + 7); }

    @Test void registrationKeepsGuestPuppyAndStoresOnlyHashedSessionAndPassword() throws Exception {
        String guest = uuid(); var before = game.state(guest);
        var result = auth.register(guest, new AuthService.Register("  " + email().toUpperCase(Locale.ROOT) + "  ", password, "  루비 엄마  "));
        Account account = accounts.findById(result.user().id()).orElseThrow();
        assertEquals(guest, account.playerId); assertEquals("루비 엄마", account.displayName);
        assertEquals(before.selectedId(), game.state(auth.resolvePlayer(result.token(), uuid())).selectedId());
        assertEquals(32, Base64.getUrlDecoder().decode(result.token()).length);
        assertEquals(64, sessions.findById(AuthService.hash(result.token())).orElseThrow().tokenHash.length());
        assertTrue(account.passwordHash.startsWith("$2a$12$")); assertNotEquals(password, account.passwordHash);
        assertFalse(account.emailVerified); assertEquals(Account.Role.USER, account.role);
        String json = mapper.writeValueAsString(auth.me(result.token()));
        for (String secret : List.of(guest, result.token(), account.passwordHash)) assertFalse(json.contains(secret));
        String accountJson = mapper.writeValueAsString(account);
        assertFalse(accountJson.contains(guest)); assertFalse(accountJson.contains(account.passwordHash));
        status(401, () -> auth.resolvePlayer(null, guest));
        verify(mail, never()).send(anyString(), anyBoolean(), anyString());
    }

    @Test void anotherRegistrationCannotClaimAnOwnedGuestAndLoginRestoresOriginalPlayer() {
        String guest = uuid(), firstEmail = email();
        var first = auth.register(guest, new AuthService.Register(firstEmail, password, "첫 가족"));
        var second = auth.register(guest, new AuthService.Register(email(), password, "다음 가족"));
        String secondPlayer = auth.resolvePlayer(second.token(), guest);
        assertNotEquals(guest, secondPlayer);
        var login = auth.login(new AuthService.Login(firstEmail.toUpperCase(Locale.ROOT), password));
        assertEquals(guest, auth.resolvePlayer(login.token(), secondPlayer));
        assertNotEquals(first.token(), login.token());
        status(401, () -> auth.resolvePlayer("invalid-session", secondPlayer));
    }

    @Test void concurrentRegistrationsAdoptGuestExactlyOnce() throws Exception {
        String guest = uuid();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<String> join = () -> { start.await(); var r = auth.register(guest, new AuthService.Register(email(), password, "가족")); return auth.resolvePlayer(r.token(), guest); };
            var a = executor.submit(join); var b = executor.submit(join); start.countDown();
            String first = a.get(15, TimeUnit.SECONDS), second = b.get(15, TimeUnit.SECONDS);
            assertNotEquals(first, second); assertTrue(first.equals(guest) ^ second.equals(guest));
        }
    }

    @Test void passwordsRespectUtf8ByteLimitAndProfilesAreValidated() {
        status(400, () -> auth.register(uuid(), new AuthService.Register(email(), "short", "이름")));
        status(400, () -> auth.register(uuid(), new AuthService.Register(email(), "한".repeat(25), "이름")));
        status(400, () -> auth.register(uuid(), new AuthService.Register("not-email", password, "이름")));
        var result = auth.register(uuid(), new AuthService.Register(email(), "한".repeat(24), "이름"));
        assertEquals(result.user().id(), auth.login(new AuthService.Login(result.user().email(), "한".repeat(24))).user().id());
        status(401, () -> auth.login(new AuthService.Login(result.user().email(), "한".repeat(24) + "a")));
        status(400, () -> auth.profile(result.token(), new AuthService.Profile("x".repeat(41))));
        status(400, () -> auth.profile(result.token(), new AuthService.Profile("이름\n개행")));
        assertEquals("새 이름", auth.profile(result.token(), new AuthService.Profile("  새 이름  ")).user().displayName());
    }

    @Test void sessionExpiryAndLogoutAreImmediateAndIdempotent() {
        var first = register(); var row = sessions.findById(AuthService.hash(first.token())).orElseThrow();
        assertTrue(row.expiresAt - row.createdAt == AuthService.SESSION_MS);
        row.expiresAt = System.currentTimeMillis() - 1; sessions.save(row);
        status(401, () -> auth.requireAccount(first.token()));
        var fresh = auth.login(new AuthService.Login(first.user().email(), password));
        auth.logout(fresh.token()); auth.logout(fresh.token()); auth.logout(null);
        status(401, () -> auth.requireAccount(fresh.token())); assertNull(auth.me(null).user());
    }

    @Test void suspendedOwnerIsBlockedWhileAnonymousUnownedPlayerRemainsAllowed() {
        var result = register(); Account account = accounts.findById(result.user().id()).orElseThrow();
        account.status = Account.Status.SUSPENDED; accounts.save(account);
        status(403, () -> auth.requireAccount(result.token()));
        status(403, () -> auth.login(new AuthService.Login(account.email, password)));
        status(403, () -> auth.assertPlayerActive(account.playerId));
        auth.assertPlayerActive(uuid()); String guest = uuid(); assertEquals(guest, auth.resolvePlayer(null, guest));
    }

    @Test void passwordChangeRevokesEverySessionAndPendingReset() {
        var first = register(); var second = auth.login(new AuthService.Login(first.user().email(), password));
        auth.requestReset(new AuthService.Email(first.user().email())); String oldReset = mailToken();
        status(400, () -> auth.password(first.token(), new AuthService.Password("wrong-password", "a-new-password-123")));
        assertTrue(auth.password(first.token(), new AuthService.Password(password, "a-new-password-123")).logout());
        status(401, () -> auth.requireAccount(first.token())); status(401, () -> auth.requireAccount(second.token()));
        status(401, () -> auth.login(new AuthService.Login(first.user().email(), password)));
        assertEquals(first.user().id(), auth.login(new AuthService.Login(first.user().email(), "a-new-password-123")).user().id());
        status(400, () -> auth.confirmReset(new AuthService.Reset(oldReset, "another-password-123")));
    }

    @Test void verificationIsHashedSingleUseExpiresAndPromotesOnlyVerifiedConfiguredAdmin() {
        var result = auth.register(uuid(), new AuthService.Register("owner@example.com", password, "관리자"));
        assertEquals(Account.Role.USER, result.user().role()); status(403, () -> auth.requireAdmin(result.token()));
        auth.requestVerification(result.token()); String old = mailToken();
        var row = emailTokens.findById(AuthService.hash(old)).orElseThrow();
        assertEquals(AuthService.VERIFY_MS, row.expiresAt - row.createdAt); assertNotEquals(old, row.tokenHash);
        auth.requestVerification(result.token()); String fresh = mailToken();
        status(400, () -> auth.confirmVerification(new AuthService.Token(old)));
        auth.confirmVerification(new AuthService.Token(fresh));
        assertTrue(auth.me(result.token()).user().emailVerified()); assertEquals(Account.Role.ADMIN, auth.requireAdmin(result.token()).role);
        status(400, () -> auth.confirmVerification(new AuthService.Token(fresh)));
        var normal = register(); auth.requestVerification(normal.token()); String expired = mailToken();
        var expiring = emailTokens.findById(AuthService.hash(expired)).orElseThrow(); expiring.expiresAt = System.currentTimeMillis() - 1; emailTokens.save(expiring);
        status(400, () -> auth.confirmVerification(new AuthService.Token(expired)));
        assertFalse(auth.me(normal.token()).user().emailVerified());
    }

    @Test void resetIsGenericSingleUseKindScopedAndRevokesSessions() {
        var result = register();
        String known = auth.requestReset(new AuthService.Email(result.user().email())).message(); String reset = mailToken();
        assertEquals(known, auth.requestReset(new AuthService.Email(email())).message());
        assertTrue(delivered.get().startsWith("http://127.0.0.1:3000/account/reset?token="));
        var row = emailTokens.findById(AuthService.hash(reset)).orElseThrow(); assertEquals(AuthService.RESET_MS, row.expiresAt - row.createdAt);
        status(400, () -> auth.confirmVerification(new AuthService.Token(reset)));
        auth.confirmReset(new AuthService.Reset(reset, "a-new-password-123"));
        status(401, () -> auth.requireAccount(result.token()));
        status(400, () -> auth.confirmReset(new AuthService.Reset(reset, "different-password-123")));
        var login = auth.login(new AuthService.Login(result.user().email(), "a-new-password-123"));
        assertTrue(login.user().emailVerified()); assertEquals(result.user().id(), login.user().id());
    }

    @Test void mailDisabledDoesNotDisableSignupAndConfiguredDeliveryErrorsDoNotEnumerateResetAccounts() {
        when(mail.enabled()).thenReturn(false);
        var result = register(); assertFalse(auth.me(result.token()).config().emailEnabled());
        assertNotNull(auth.login(new AuthService.Login(result.user().email(), password)));
        status(503, () -> auth.requestVerification(result.token()));
        status(503, () -> auth.requestReset(new AuthService.Email(email())));
        when(mail.enabled()).thenReturn(true);
        doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "delivery failed")).when(mail).send(anyString(), anyBoolean(), anyString());
        assertEquals(auth.requestReset(new AuthService.Email(result.user().email())).message(), auth.requestReset(new AuthService.Email(email())).message());
        assertTrue(emailTokens.findByAccountIdAndKind(result.user().id(), AuthEmailToken.Kind.RESET).isEmpty());
    }

    @Test void failedLoginRateLimitSurvivesRollbackAndDoesNotBlockUnrelatedAccount() {
        String unknown = email();
        for (int i = 0; i < 10; i++) status(401, () -> auth.login(new AuthService.Login(unknown, password)));
        status(429, () -> auth.login(new AuthService.Login(unknown, password)));
        var result = register(); assertNotNull(auth.login(new AuthService.Login(result.user().email(), password)));
    }

    @Test void kakaoUsesProviderIdentityWithoutEmailAccountAutoLinkAndNeverAddsPasswordLogin() {
        var emailAccount = register(); String guest = uuid();
        when(kakao.enabled()).thenReturn(true);
        when(kakao.exchange("code-a", "callback")).thenReturn(new KakaoClient.Identity("123456789", emailAccount.user().email(), true, "카카오 이름"));
        var provider = auth.kakao(guest, new AuthService.Kakao("code-a", "callback"));
        assertNotEquals(emailAccount.user().id(), provider.user().id()); assertNull(provider.user().email());
        assertEquals("KAKAO", provider.user().provider()); assertEquals(guest, auth.resolvePlayer(provider.token(), uuid()));
        assertNull(accounts.findById(provider.user().id()).orElseThrow().passwordHash);
        when(kakao.exchange("code-b", "callback")).thenReturn(new KakaoClient.Identity("123456789", "changed@example.com", true, "다른 이름"));
        var again = auth.kakao(uuid(), new AuthService.Kakao("code-b", "callback"));
        assertEquals(provider.user().id(), again.user().id()); assertEquals(guest, auth.resolvePlayer(again.token(), uuid()));
        status(400, () -> auth.password(provider.token(), new AuthService.Password(password, "new-password-123")));
    }

    @Test void kakaoClientRejectsUntrustedRedirectsAndInvalidProviderIdsWithoutNetwork() {
        var disabled = new KakaoClient(mapper, "", "", "http://127.0.0.1:3001");
        status(503, () -> disabled.exchange("code", "http://127.0.0.1:3001/api/auth/kakao/callback"));
        var enabled = new KakaoClient(mapper, "configured-key", "secret", "http://127.0.0.1:3001");
        status(400, () -> enabled.exchange("code", "https://attacker.example/callback"));
        status(502, () -> KakaoClient.identity(Map.of("id", "123")));
        status(502, () -> KakaoClient.identity(Map.of("id", -1)));
        var identity = KakaoClient.identity(Map.of("id", 123L, "kakao_account", Map.of("email", "unverified@example.com", "is_email_valid", true, "is_email_verified", false)));
        assertNull(identity.email()); assertFalse(identity.emailVerified());
    }

    @Test void concurrentResetConfirmationChangesPasswordOnlyOnce() throws Exception {
        var result = register(); auth.requestReset(new AuthService.Email(result.user().email())); String token = mailToken();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Boolean> reset = () -> { start.await(); try { auth.confirmReset(new AuthService.Reset(token, "new-password-123")); return true; } catch (ResponseStatusException error) { assertEquals(400, error.getStatusCode().value()); return false; } };
            var a = executor.submit(reset); var b = executor.submit(reset); start.countDown();
            assertNotEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        }
    }

    @Test void publicSiteRequiresSafeOriginAndNormalizesDefaultPorts() {
        assertEquals("http://127.0.0.1:3001", AuthSite.origin("http://127.0.0.1:3001/"));
        assertEquals("https://example.com", AuthSite.origin("https://EXAMPLE.com:443/"));
        assertEquals("http://[::1]:3001", AuthSite.origin("http://[::1]:3001"));
        for (String invalid : List.of("http://example.com", "https://example.com/account", "https://name:password@example.com", "https://example.com?next=bad", "https://example.com#fragment", "ftp://localhost", "https://example.com:99999", "https://example.com:0", "https://example.com/%0a"))
            assertThrows(IllegalArgumentException.class, () -> AuthSite.origin(invalid));
    }

    @Test void committedPasswordChangeAndResetAlsoRevokePreviouslyLinkedDesktopTokens() {
        var account = register(); String player = auth.resolvePlayer(account.token(), uuid());
        var device = desktop.pair(new DesktopService.PairInput(desktop.pairCode(player).code(), "비밀번호 테스트 PC"));
        auth.password(account.token(), new AuthService.Password(password, "changed-password-123"));
        status(401, () -> desktop.state(device.token()));
        var secondDevice = desktop.pair(new DesktopService.PairInput(desktop.pairCode(player).code(), "재설정 테스트 PC"));
        auth.requestReset(new AuthService.Email(account.user().email()));
        auth.confirmReset(new AuthService.Reset(mailToken(), "reset-password-123"));
        status(401, () -> desktop.state(secondDevice.token()));
    }
}
