using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class SyncScenario
    {
        public string origin { get; set; } public string code { get; set; } public string browserCookie { get; set; }
        public string output { get; set; } public SyncStep[] steps { get; set; }
    }
    internal sealed class SyncStep
    {
        public string op { get; set; } public string action { get; set; } public string value { get; set; } public string path { get; set; }
        public Dictionary<string, object> body { get; set; }
        public string expectedName { get; set; } public string expectedGrade { get; set; } public string expectedFur { get; set; }
        public string expectedEyes { get; set; } public string expectedAccessory { get; set; }
        public int? expectedBreed { get; set; } public int? expectedXp { get; set; } public int? xpDelta { get; set; } public int? expectedStatus { get; set; }
        public bool? expectedLinked { get; set; } public bool? expectedOnline { get; set; } public bool? expectedPending { get; set; }
    }
    internal static class SyncTest
    {
        private static void Check(bool value, string description, List<string> report)
        {
            if (!value) throw new Exception(description);
            report.Add("PASS " + description);
        }

        internal static void Units(List<string> report, string output)
        {
            using (var unlinked = new DesktopSync(null, false))
                Check(unlinked.Origin == "https://puppyruby.com", "unlinked desktop uses the public PuppyRuby origin", report);
            Check(DesktopSync.ValidateOrigin("https://example.com/") == "https://example.com", "sync HTTPS origin normalization", report);
            Check(DesktopSync.ValidateOrigin("https://www.puppyruby.com/") == "https://puppyruby.com", "legacy public origin migrates to the canonical origin", report);
            Check(DesktopSync.ValidateOrigin("https://www.puppyruby.com.example/") == "https://www.puppyruby.com.example", "legacy origin migration matches only the exact host", report);
            Check(DesktopSync.ValidateOrigin("http://127.0.0.1:3001") == "http://127.0.0.1:3001", "sync loopback HTTP allowed", report);
            Uri ipv6 = new Uri(DesktopSync.ValidateOrigin("http://[::1]:3001/"));
            Check(ipv6.IsLoopback && ipv6.Port == 3001 && ipv6.Scheme == "http", "sync IPv6 loopback allowed", report);
            string[] rejected = { "http://example.com", "http://localhost.evil.test", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?token=a", "https://example.com/#fragment", "file:///C:/secret", "javascript:alert(1)" };
            foreach (string address in rejected)
            {
                bool failed = false; try { DesktopSync.ValidateOrigin(address); } catch (ArgumentException) { failed = true; }
                Check(failed, "sync rejects unsafe or non-origin URL " + address, report);
            }
            Check(DesktopBreedCatalog.Ids.Length == 30 && DesktopBreedCatalog.Ids[0] == "pomeranian" && DesktopBreedCatalog.Ids[5] == "beagle" && DesktopBreedCatalog.Ids[29] == "chowchow", "30-breed catalog preserves original saved indices", report);
            var breedState = new DesktopGameState { puppy = new SyncedPuppy { id = "breed-test", name = "품종 검증", grade = "N", xp = 0 }, promotionXp = 100 };
            for (int index = 0; index < DesktopBreedCatalog.Ids.Length; index++)
            {
                breedState.puppy.breed = index;
                DesktopSync.ValidateState(breedState);
            }
            Check(true, "sync accepts every registered breed index", report);
            foreach (int index in new[] { -1, DesktopBreedCatalog.Ids.Length, Int32.MaxValue })
            {
                breedState.puppy.breed = index;
                bool failed = false; try { DesktopSync.ValidateState(breedState); } catch (InvalidDataException) { failed = true; }
                Check(failed, "sync rejects unregistered breed index " + index, report);
            }
            string cache = Path.Combine(Path.GetDirectoryName(output), "test-desktop.link");
            var record = new DesktopLinkRecord { origin = "https://www.puppyruby.com", token = "unit-test-token-not-a-real-credential", deviceId = "unit-device", deviceLabel = "검증용 기기", cachedState = new DesktopGameState { puppy = new SyncedPuppy { id = "unit-puppy", name = "쿠키", breed = 29, grade = "SR", xp = 72, fur = "rose", eyes = "green", accessory = "crown" }, promotionXp = 100, obedience = 90, coins = 12 } };
            LinkStorage.Save(cache, record);
            Check(!Encoding.UTF8.GetString(File.ReadAllBytes(cache)).Contains(record.token), "DPAPI cache never stores bearer token in plaintext", report);
            DesktopLinkRecord restored = LinkStorage.Load(cache);
            Check(restored.token == record.token && restored.deviceLabel == record.deviceLabel, "DPAPI CurrentUser credential round-trip", report);
            Check(restored.origin == "https://puppyruby.com", "encrypted legacy link origin migrates on restart", report);
            Check(restored.cachedState.puppy.breed == 29, "new breed cache survives encrypted save and restart", report);
            Check(restored.cachedState.puppy.name == "쿠키" && restored.cachedState.puppy.grade == "SR" && restored.cachedState.puppy.xp == 72 && restored.cachedState.puppy.fur == "rose" && restored.cachedState.puppy.eyes == "green" && restored.cachedState.puppy.accessory == "crown", "linked appearance grade and XP cache round-trip", report);
            Progression standalone = new Progression(); standalone.RewardActivity(DateTime.UtcNow);
            using (var client = new DesktopSync(cache, true))
            {
                Check(client.IsLinked && !client.Online && !client.CanAct, "cached linked pet starts offline and read-only", report);
                Check(client.Origin == "https://puppyruby.com", "migrated encrypted link uses the canonical origin", report);
                bool refused = false;
                try { client.ActAsync("feed", "unit-puppy", null).GetAwaiter().GetResult(); } catch (InvalidOperationException) { refused = true; }
                Check(refused && client.State.puppy.xp == 72 && !client.HasPending && standalone.Xp == 10, "offline linked care cannot earn queue or merge local XP", report);
                CommandReply answer = CommandCatalog.Load().Resolve("한글 붙여넣기", "hwp", client.State.puppy.grade);
                Check(answer.Status == "success" && client.State.puppy.xp == 72 && !client.HasPending, "offline shortcut lookup uses cached grade without XP or networking", report);
                client.Disconnect("test disconnect");
                Check(!client.IsLinked && !File.Exists(cache) && standalone.Xp == 10, "disconnect clears credentials and preserves standalone progression", report);
            }
        }

        // A separate, explicit test mode. The caller supplies a disposable server,
        // one-time code and test-only browser cookie. User settings are never read.
        internal static int Run(string configuration)
        {
            SyncScenario scenario = new JavaScriptSerializer().Deserialize<SyncScenario>(File.ReadAllText(configuration));
            var report = new List<string>();
            try { Task.Run(async delegate { await Execute(scenario, report); }).GetAwaiter().GetResult(); File.WriteAllLines(scenario.output, report.ToArray()); return 0; }
            catch (Exception error) { report.Add("FAIL " + error.GetType().Name + ": " + error.Message); File.WriteAllLines(scenario.output, report.ToArray()); return 1; }
        }

        private static async Task Execute(SyncScenario scenario, List<string> report)
        {
            string origin = DesktopSync.ValidateOrigin(scenario.origin);
            string path = Path.Combine(Path.GetDirectoryName(scenario.output), "sync-integration.link");
            Directory.CreateDirectory(Path.GetDirectoryName(scenario.output));
            DesktopSync client = new DesktopSync(path, false);
            try
            {
                await client.PairAsync(origin, scenario.code, "자동 검증용 PC");
                Check(client.IsLinked && client.Online && client.State != null, "actual C# HttpClient one-time pairing", report);
                int index = 0;
                foreach (SyncStep step in scenario.steps ?? new SyncStep[0])
                {
                    index++;
                    int previousXp = client.State == null ? 0 : client.State.puppy.xp;
                    if (step.op == "poll") await client.PollAsync();
                    else if (step.op == "action") await client.ActAsync(step.action, client.State.puppy.id, step.value);
                    else if (step.op == "retry") await client.RetryPendingAsync();
                    else if (step.op == "restart") { client.Dispose(); client = new DesktopSync(path, true); }
                    else if (step.op == "disconnect") client.Disconnect("integration disconnect");
                    else if (step.op == "offline-action")
                    {
                        bool refused = false; try { await client.ActAsync(step.action ?? "feed", client.State.puppy.id, step.value); } catch (InvalidOperationException) { refused = true; }
                        Check(refused && !client.HasPending && client.State.puppy.xp == previousXp, "step " + index + " offline action denied without queue or XP", report);
                    }
                    else if (step.op == "action-error")
                    {
                        bool rejected = false;
                        try { await client.ActAsync(step.action, client.State.puppy.id, step.value); }
                        catch (DesktopApiException error) { rejected = error.StatusCode == step.expectedStatus; }
                        catch (InvalidOperationException) { rejected = !step.expectedStatus.HasValue; }
                        Check(rejected, "step " + index + " expected action rejection", report);
                    }
                    else if (step.op == "browser" || step.op == "revoke")
                    {
                        string endpoint = step.op == "revoke" ? "/api/desktop/revoke" : step.path;
                        var values = step.op == "revoke" ? new Dictionary<string, object> { { "deviceId", client.DeviceId } } : step.body ?? new Dictionary<string, object>();
                        foreach (string key in new List<string>(values.Keys)) if (Convert.ToString(values[key]) == "$puppy") values[key] = client.State.puppy.id;
                        await BrowserWrite(origin, endpoint, values, scenario.browserCookie);
                    }
                    else if (step.op != "expect") throw new InvalidDataException("Unknown sync test step " + step.op);
                    if (step.expectedLinked.HasValue) Check(client.IsLinked == step.expectedLinked.Value, "step " + index + " linked state", report);
                    if (step.expectedOnline.HasValue) Check(client.Online == step.expectedOnline.Value, "step " + index + " online state", report);
                    if (step.expectedPending.HasValue) Check(client.HasPending == step.expectedPending.Value, "step " + index + " pending request state", report);
                    if (client.State != null)
                    {
                        SyncedPuppy dog = client.State.puppy;
                        if (step.expectedName != null) Check(dog.name == step.expectedName, "step " + index + " selected name sync", report);
                        if (step.expectedGrade != null) Check(dog.grade == step.expectedGrade, "step " + index + " grade sync", report);
                        if (step.expectedFur != null) Check(dog.fur == step.expectedFur, "step " + index + " fur sync", report);
                        if (step.expectedEyes != null) Check(dog.eyes == step.expectedEyes, "step " + index + " eyes sync", report);
                        if (step.expectedAccessory != null) Check(dog.accessory == step.expectedAccessory, "step " + index + " accessory sync", report);
                        if (step.expectedBreed.HasValue) Check(dog.breed == step.expectedBreed.Value, "step " + index + " breed sync", report);
                        if (step.expectedXp.HasValue) Check(dog.xp == step.expectedXp.Value, "step " + index + " XP sync", report);
                        if (step.xpDelta.HasValue) Check(dog.xp - previousXp == step.xpDelta.Value, "step " + index + " authoritative XP delta", report);
                    }
                    report.Add("PASS completed integration step " + index + " " + step.op);
                }
            }
            finally { client.Dispose(); LinkStorage.Clear(path); }
        }
        private static async Task BrowserWrite(string origin, string path, object body, string cookie)
        {
            string[] allowed = { "/api/game/customize", "/api/game/rename", "/api/game/select", "/api/game/feed", "/api/game/play", "/api/game/rest", "/api/game/train", "/api/game/promote", "/api/desktop/revoke" };
            if (Array.IndexOf(allowed, path) < 0 || String.IsNullOrWhiteSpace(cookie)) throw new InvalidDataException("Sync integration browser step requires an allowed game path and disposable browser cookie.");
            using (var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }))
            using (var request = new HttpRequestMessage(HttpMethod.Post, origin + path))
            {
                request.Headers.Add("Cookie", cookie);
                request.Content = new StringContent(new JavaScriptSerializer().Serialize(body), Encoding.UTF8, "application/json");
                using (HttpResponseMessage response = await http.SendAsync(request)) if (!response.IsSuccessStatusCode) throw new Exception("Disposable browser step returned HTTP " + (int)response.StatusCode);
            }
        }
    }
}
