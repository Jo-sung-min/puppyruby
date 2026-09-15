using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // Standalone integration harness. Only the explicitly supplied workspace directory
    // is written; no user profile, real account, or running application is touched.
    internal static class DesktopAppearanceCacheTest
    {
        private static int checks;
        private static string outputRoot;
        private static readonly string[] Names = { "idle", "side", "walk", "happy", "sleep" };
        private static readonly Dictionary<string, byte[]> Images = new Dictionary<string, byte[]>();
        private static readonly Dictionary<string, byte[]> FixtureImages = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        private static readonly List<string> Results = new List<string>();
        private const string TestToken = "local-fixture-token-not-a-real-credential";

        private sealed class Request
        {
            internal string Path;
            internal Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        private sealed class FixtureServer : IDisposable
        {
            private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
            private readonly List<Request> requests = new List<Request>();
            private readonly Task accept;
            internal readonly TaskCompletionSource<bool> SlowStarted = new TaskCompletionSource<bool>();
            internal readonly TaskCompletionSource<bool> SlowRelease = new TaskCompletionSource<bool>();
            internal readonly string Origin;
            internal DesktopAppearance Appearance;
            internal bool Stopped;

            internal FixtureServer()
            {
                listener.Start();
                Origin = "http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port;
                accept = Accept();
            }

            private async Task Accept()
            {
                while (!Stopped)
                {
                    try
                    {
                        TcpClient client = await listener.AcceptTcpClientAsync();
                        Handle(client);
                    }
                    catch (ObjectDisposedException) { return; }
                    catch (SocketException) { if (Stopped) return; throw; }
                }
            }

            private async void Handle(TcpClient client)
            {
                using (client)
                {
                    try
                    {
                        NetworkStream stream = client.GetStream();
                        var reader = new StreamReader(stream, Encoding.UTF8, false, 4096, true);
                        string first = await reader.ReadLineAsync();
                        if (String.IsNullOrEmpty(first)) return;
                        var request = new Request { Path = first.Split(' ')[1] };
                        string line;
                        while (!String.IsNullOrEmpty(line = await reader.ReadLineAsync()))
                        {
                            int separator = line.IndexOf(':');
                            if (separator > 0) request.Headers[line.Substring(0, separator)] = line.Substring(separator + 1).Trim();
                        }
                        int length;
                        if (request.Headers.ContainsKey("Content-Length") && Int32.TryParse(request.Headers["Content-Length"], out length) && length > 0)
                        {
                            var body = new char[length]; int consumed = 0;
                            while (consumed < length) { int count = await reader.ReadAsync(body, consumed, length - consumed); if (count == 0) break; consumed += count; }
                        }
                        lock (requests) requests.Add(request);
                        if (request.Path.StartsWith("/slow/", StringComparison.Ordinal))
                        {
                            SlowStarted.TrySetResult(true);
                            await SlowRelease.Task;
                        }
                        if (request.Path.StartsWith("/redirect/", StringComparison.Ordinal))
                        {
                            await Reply(stream, 302, new byte[0], "Location: " + Origin + "/leak/idle.png\r\n"); return;
                        }
                        if (request.Path.StartsWith("/oversized/", StringComparison.Ordinal))
                        {
                            byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Length: 13000000\r\nConnection: close\r\n\r\n");
                            await stream.WriteAsync(header, 0, header.Length); return;
                        }
                        if (request.Path.StartsWith("/api/desktop/", StringComparison.Ordinal))
                        {
                            var state = new DesktopGameState { puppy = new SyncedPuppy { id = "fixture-puppy", name = "fixture", breed = 0, grade = "R", xp = 0 }, promotionXp = 100, appearance = Appearance };
                            object result = request.Path == "/api/desktop/pair" ? (object)new PairResponse { token = TestToken, device = new DesktopDevice { id = "fixture-device", label = "cache-test" }, state = state } : state;
                            await Reply(stream, 200, Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(result)), "Content-Type: application/json\r\n"); return;
                        }
                        byte[] image;
                        if (!FixtureImages.TryGetValue(request.Path, out image))
                        {
                            string scene = Path.GetFileNameWithoutExtension(request.Path);
                            if (!Images.TryGetValue(scene, out image)) { await Reply(stream, 404, new byte[0], ""); return; }
                        }
                        await Reply(stream, 200, image, "Content-Type: image/png\r\nSet-Cookie: should-not-be-returned=1; Path=/\r\n");
                    }
                    catch (IOException) { }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                }
            }

            private static async Task Reply(NetworkStream stream, int status, byte[] body, string headers)
            {
                byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + " Fixture\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n" + headers + "\r\n");
                await stream.WriteAsync(header, 0, header.Length);
                if (body.Length > 0) await stream.WriteAsync(body, 0, body.Length);
            }

            internal Request[] Snapshot() { lock (requests) return requests.ToArray(); }
            internal int Count(string prefix)
            {
                int count = 0;
                foreach (Request request in Snapshot()) if (request.Path.StartsWith(prefix, StringComparison.Ordinal)) count++;
                return count;
            }
            public void Dispose()
            {
                if (Stopped) return; Stopped = true; SlowRelease.TrySetResult(true); listener.Stop();
                try { accept.GetAwaiter().GetResult(); } catch (ObjectDisposedException) { }
            }
        }

        private static void Check(bool condition, string description)
        {
            checks++;
            if (!condition) throw new Exception("FAILED: " + description);
        }
        private static void Done(string description) { Results.Add(description); Console.WriteLine("PASS " + description); }
        private static string CachePath(string scenario) { return Path.Combine(outputRoot, scenario); }
        private static string HashText(string text) { return DesktopAppearanceCache.Hash(Encoding.UTF8.GetBytes(text)); }
        private static DesktopAppearance Descriptor(string origin, string path, string identity)
        {
            int width, height;
            using (var stream = new MemoryStream(Images["idle"]))
            using (var image = new Bitmap(stream)) { width = image.Width; height = image.Height; }
            var value = new DesktopAppearance { version = 1, key = HashText(identity), styleId = "art-16-scenes", styleName = "Pixel art 16", breedId = "pomeranian", width = width, height = height, scenes = new Dictionary<string, DesktopAppearanceScene>() };
            foreach (string name in Names) value.scenes.Add(name, new DesktopAppearanceScene { url = origin + "/" + path + "/" + name + ".png", sha256 = DesktopAppearanceCache.Hash(Images[name]), frames = name == "walk" ? 8 : 1, frameMs = name == "walk" ? 125 : 600 });
            return value;
        }
        private static byte[] TwoTonePng(int width, int height, Color left, Color right)
        {
            using (var image = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            {
                for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++) image.SetPixel(x, y, x < width / 2 ? left : right);
                using (var output = new MemoryStream())
                {
                    image.Save(output, System.Drawing.Imaging.ImageFormat.Png);
                    return output.ToArray();
                }
            }
        }
        private static void PrepareLayeredFixtureImages()
        {
            int index = 0;
            foreach (string name in Names)
            {
                FixtureImages.Add("/layered/legacy/" + name + ".png", TwoTonePng(24, 24,
                    Color.FromArgb(255, 45 + index, 48, 52), Color.FromArgb(255, 55 + index, 58, 62)));
                FixtureImages.Add("/layered/body/" + name + ".png", TwoTonePng(48, 24,
                    Color.FromArgb(255, 70 + index, 74, 78), Color.FromArgb(255, 82 + index, 86, 90)));
                index += 9;
            }
            FixtureImages.Add("/layered/eyes/ruby-eye-01.png", TwoTonePng(32, 16, Color.Red, Color.Blue));
            FixtureImages.Add("/layered/eyes/ruby-eye-03.png", TwoTonePng(32, 16, Color.Lime, Color.Gold));
            FixtureImages.Add("/layered/bad/body-dimension.png", TwoTonePng(47, 24, Color.Gray, Color.Silver));
            FixtureImages.Add("/layered/bad/body-hash.png", FixtureImages["/layered/body/idle.png"]);
            FixtureImages.Add("/layered/bad/eye-dimension.png", TwoTonePng(31, 16, Color.Purple, Color.Pink));
            FixtureImages.Add("/layered/bad/eye-hash.png", FixtureImages["/layered/eyes/ruby-eye-01.png"]);
        }
        private static DesktopEyeAnchor[][] LayeredAnchors()
        {
            return new[]
            {
                new[] { new DesktopEyeAnchor { x = 4, y = 6, width = 4, height = 4 }, new DesktopEyeAnchor { x = 14, y = 6, width = 4, height = 4 } },
                new[] { new DesktopEyeAnchor { x = 5, y = 7, width = 4, height = 4 }, new DesktopEyeAnchor { x = 15, y = 7, width = 4, height = 4 } }
            };
        }
        private static DesktopAppearance LayeredDescriptor(string origin, string eyeStyle, string renderIdentity)
        {
            string eyePath = "/layered/eyes/" + eyeStyle + ".png";
            var value = new DesktopAppearance
            {
                version = 1,
                key = HashText("layered-stable-legacy-key"),
                renderKey = HashText(renderIdentity),
                styleId = "ruby-round-scenes",
                styleName = "Ruby round layered test",
                breedId = "pomeranian",
                width = 24,
                height = 24,
                scenes = new Dictionary<string, DesktopAppearanceScene>()
            };
            foreach (string name in Names)
            {
                string legacyPath = "/layered/legacy/" + name + ".png";
                string bodyPath = "/layered/body/" + name + ".png";
                value.scenes.Add(name, new DesktopAppearanceScene
                {
                    url = origin + legacyPath,
                    sha256 = DesktopAppearanceCache.Hash(FixtureImages[legacyPath]),
                    frames = 1,
                    frameMs = name == "walk" ? 125 : 600,
                    bodyUrl = origin + bodyPath,
                    bodySha256 = DesktopAppearanceCache.Hash(FixtureImages[bodyPath]),
                    bodyFrames = 2,
                    eyeUrl = origin + eyePath,
                    eyeSha256 = DesktopAppearanceCache.Hash(FixtureImages[eyePath]),
                    eyeStyle = eyeStyle,
                    eyeAnchors = LayeredAnchors()
                });
            }
            return value;
        }
        private static async Task Within(Task task, string operation)
        {
            if (await Task.WhenAny(task, Task.Delay(12000)) != task) throw new TimeoutException(operation);
            await task;
        }
        private static void Reject(Action action, string description)
        {
            bool rejected = false;
            try { action(); } catch (InvalidDataException) { rejected = true; } catch (ArgumentException) { rejected = true; }
            Check(rejected, description);
        }

        private static async Task InitialAndOffline()
        {
            string origin; DesktopAppearance descriptor;
            using (var server = new FixtureServer())
            {
                origin = server.Origin; descriptor = Descriptor(origin, "original", "original"); server.Appearance = descriptor;
                using (var sync = new DesktopSync(null, false))
                using (var cache = new DesktopAppearanceCache(CachePath("persistent")))
                {
                    await Within(sync.PairAsync(origin, "ABCD-EFGH-IJKL", "cache-test"), "fixture pairing");
                    await Within(sync.PollAsync(), "authenticated fixture poll");
                    Check(sync.IsLinked && sync.Online && sync.State.appearance.key == descriptor.key, "real DesktopSync carries web appearance descriptor");
                    await Within(cache.UpdateAsync(sync.State.appearance, origin), "first five-scene load");
                    Check(cache.Current != null && cache.Current.Key == descriptor.key, "first appearance is published (status=" + cache.Status + ", image requests=" + server.Count("/original/") + ")");
                    Check(server.Count("/original/") == 5, "first load downloads all five scenes exactly once");
                    Check(!cache.Busy && cache.Status.Contains("적용됨"), "first load finishes with applied status");
                    await cache.UpdateAsync(descriptor, origin);
                    Check(server.Count("/original/") == 5, "same key does not re-download");
                    foreach (string name in Names)
                    {
                        string file = Path.Combine(CachePath("persistent"), descriptor.scenes[name].sha256 + ".png");
                        Check(File.Exists(file) && DesktopAppearanceCache.Hash(File.ReadAllBytes(file)) == descriptor.scenes[name].sha256, "cached original bytes: " + name);
                    }
                    Check(cache.Current.Width == 369 && cache.Current.Height == 384, "native 369 x 384 canvas is preserved");
                    for (int frame = 0; frame < 8; frame++)
                    {
                        using (var stream = new MemoryStream(Images["walk"]))
                        using (var source = new Bitmap(stream))
                        {
                            var rendered = cache.Current.Get("walk", frame, false).Image;
                            var flipped = cache.Current.Get("walk", frame, true).Image;
                            for (int y = 21; y < descriptor.height; y += 61)
                            for (int x = 19; x < descriptor.width; x += 53)
                            {
                                Color expected = source.GetPixel(frame * descriptor.width + x, y);
                                if (expected.A == 255)
                                {
                                    Check(rendered.GetPixel(x, y).ToArgb() == expected.ToArgb(), "walking frame keeps native opaque pixel");
                                    Check(flipped.GetPixel(descriptor.width - 1 - x, y).ToArgb() == expected.ToArgb(), "right-facing frame mirrors the native pixel");
                                }
                                Check(rendered.GetPixel(x, y).A == expected.A, "walking frame keeps original alpha");
                            }
                        }
                    }
                    bool bearerSeen = false;
                    foreach (Request request in server.Snapshot())
                    {
                        if (request.Path == "/api/desktop/state") bearerSeen = request.Headers.ContainsKey("Authorization") && request.Headers["Authorization"] == "Bearer " + TestToken;
                        if (!request.Path.StartsWith("/api/desktop/", StringComparison.Ordinal))
                        {
                            Check(!request.Headers.ContainsKey("Authorization"), "image request has no device bearer token");
                            Check(!request.Headers.ContainsKey("Cookie"), "image response cookie is not reused");
                            Check(!request.Path.Contains(TestToken), "image path has no device token");
                        }
                    }
                    Check(bearerSeen, "credential separation test uses a real authenticated API request");
                }
            }
            using (var offline = new DesktopAppearanceCache(CachePath("persistent")))
            {
                await Within(offline.UpdateAsync(descriptor, origin), "offline reload after HTTP server shutdown");
                Check(offline.Current != null && offline.Current.Key == descriptor.key, "fresh process-style cache reload works offline");
                Check(offline.Current.Get("walk", 7, false).Image.Width == descriptor.width, "offline walking frames remain available");
            }
            Done("five-scene HTTP load, native frames, duplicate suppression, token/cookie isolation, offline restart");
        }

        private static async Task CorruptionAndFailures()
        {
            using (var server = new FixtureServer())
            {
                var descriptor = Descriptor(server.Origin, "recovery", "recovery");
                string idleFile = Path.Combine(CachePath("persistent"), descriptor.scenes["idle"].sha256 + ".png");
                File.WriteAllBytes(idleFile, new byte[] { 1, 2, 3 });
                using (var cache = new DesktopAppearanceCache(CachePath("persistent")))
                {
                    await Within(cache.UpdateAsync(descriptor, server.Origin), "corrupt cache recovery");
                    Check(cache.Current != null, "corrupt cached file recovers");
                    Check(server.Count("/recovery/") == 1, "only corrupt scene is fetched again");
                    Check(DesktopAppearanceCache.Hash(File.ReadAllBytes(idleFile)) == descriptor.scenes["idle"].sha256, "corrupt bytes replaced with original PNG");
                }
                foreach (string mode in new[] { "wrong-hash", "wrong-dimensions", "redirect", "oversized" })
                {
                    var bad = Descriptor(server.Origin, mode, mode);
                    if (mode == "wrong-hash") bad.scenes["idle"].sha256 = new string('0', 64);
                    if (mode == "wrong-dimensions") bad.width++;
                    using (var cache = new DesktopAppearanceCache(CachePath(mode)))
                    {
                        await Within(cache.UpdateAsync(bad, server.Origin), mode);
                        Check(cache.Current == null && !cache.Busy, mode + " cannot replace the appearance");
                        Check(cache.Status.Contains("불러오지 못했어요"), mode + " produces recoverable error status");
                        int before = server.Count("/" + mode + "/");
                        await cache.UpdateAsync(bad, server.Origin);
                        Check(server.Count("/" + mode + "/") == before, mode + " failed request is backed off");
                    }
                }
                Check(server.Count("/leak/") == 0, "redirect is never followed");
                using (var cache = new DesktopAppearanceCache(CachePath("persistent")))
                {
                    await cache.UpdateAsync(descriptor, server.Origin);
                    var bad = Descriptor(server.Origin, "wrong-hash", "retain-good");
                    bad.scenes["idle"].sha256 = new string('1', 64);
                    await cache.UpdateAsync(bad, server.Origin);
                    Check(cache.Current != null && cache.Current.Key == descriptor.key, "failed replacement keeps previous appearance");
                    await cache.UpdateAsync(null, server.Origin);
                    Check(cache.Current == null && !cache.Busy, "disconnect clears web appearance");
                }
                Check(Directory.GetFiles(outputRoot, "*.tmp", SearchOption.AllDirectories).Length == 0, "no partial temporary cache files remain");
            }
            Done("corrupt-cache recovery, SHA/dimension/file-size rejection, redirect refusal, retry backoff, previous appearance retention");
        }

        private static async Task Races()
        {
            using (var server = new FixtureServer())
            using (var cache = new DesktopAppearanceCache(CachePath("race")))
            {
                var old = Descriptor(server.Origin, "slow", "old");
                var next = Descriptor(server.Origin, "new", "new");
                Task oldLoad = cache.UpdateAsync(old, server.Origin);
                await Within(server.SlowStarted.Task, "old request starts");
                await cache.UpdateAsync(old, server.Origin);
                Check(server.Count("/slow/") == 1, "same pending key does not duplicate download");
                await Within(cache.UpdateAsync(next, server.Origin), "newer appearance finishes");
                Check(cache.Current != null && cache.Current.Key == next.key, "newer appearance is current");
                server.SlowRelease.TrySetResult(true);
                await Within(oldLoad, "stale request completes");
                Check(cache.Current != null && cache.Current.Key == next.key && !cache.Busy, "stale request cannot overwrite newer appearance");
            }
            using (var server = new FixtureServer())
            using (var cache = new DesktopAppearanceCache(CachePath("clear-race")))
            {
                Task load = cache.UpdateAsync(Descriptor(server.Origin, "slow", "clear-race"), server.Origin);
                await Within(server.SlowStarted.Task, "pending request starts before disconnect");
                await cache.UpdateAsync(null, server.Origin);
                server.SlowRelease.TrySetResult(true);
                await Within(load, "cancelled request finishes");
                Check(cache.Current == null && !cache.Busy, "disconnect prevents pending appearance from returning");
                var reconnect = Descriptor(server.Origin, "reconnect", "reconnect");
                await Within(cache.UpdateAsync(reconnect, server.Origin), "reconnect after cancelled download");
                Check(cache.Current != null && cache.Current.Key == reconnect.key, "reconnect after cancellation can load a new appearance");
            }
            Done("pending-key suppression, latest appearance wins, disconnect cancels pending images");
        }

        private static async Task StaticStyleAndRevert()
        {
            using (var server = new FixtureServer())
            using (var cache = new DesktopAppearanceCache(CachePath("static")))
            {
                var descriptor = Descriptor(server.Origin, "static", "static-art-16");
                descriptor.styleId = "art-16";
                foreach (string name in Names)
                    descriptor.scenes[name] = new DesktopAppearanceScene { url = server.Origin + "/static/idle.png", sha256 = DesktopAppearanceCache.Hash(Images["idle"]), frames = 1, frameMs = 600 };
                await Within(cache.UpdateAsync(descriptor, server.Origin), "static PNG appearance");
                Check(cache.Current != null && cache.Current.StyleId == "art-16", "original static styles remain applicable");
                Check(server.Count("/static/") == 1, "five references to one static PNG are fetched only once");
                Check(cache.Current.CachedFrameCount == 2, "static style reuses decoded normal and flipped frames");
                foreach (string name in Names) Check(cache.Current.Get(name, 7, false).Image.Width == descriptor.width, "static style has a usable " + name + " scene");
            }
            using (var server = new FixtureServer())
            using (var cache = new DesktopAppearanceCache(CachePath("revert")))
            {
                var original = Descriptor(server.Origin, "original", "revert-original");
                await cache.UpdateAsync(original, server.Origin);
                Check(cache.Current != null, "original appearance loads before pending-change revert");
                // A corrupt disk entry forces a real delayed request while the original
                // decoded frames are still available to the desktop paint loop.
                File.WriteAllBytes(Path.Combine(CachePath("revert"), original.scenes["idle"].sha256 + ".png"), new byte[] { 0 });
                var pending = Descriptor(server.Origin, "slow", "revert-pending");
                Task load = cache.UpdateAsync(pending, server.Origin);
                await Within(server.SlowStarted.Task, "pending replacement starts before reverting");
                await cache.UpdateAsync(original, server.Origin);
                server.SlowRelease.TrySetResult(true);
                await Within(load, "reverted replacement settles");
                Check(cache.Current != null && cache.Current.Key == original.key && !cache.Busy, "returning to current appearance cancels the pending replacement");
            }
            Done("static style compatibility, shared-PNG download/decode reuse, reverting a pending style change");
        }

        private static async Task LayeredEyeDownloadsAndCache()
        {
            using (var server = new FixtureServer())
            using (var cache = new DesktopAppearanceCache(CachePath("layered")))
            {
                var first = LayeredDescriptor(server.Origin, "ruby-eye-01", "layered-eye-01");
                await Within(cache.UpdateAsync(first, server.Origin), "first layered eye appearance");
                Check(cache.Current != null && cache.Current.Key == first.renderKey, "layered appearance publishes the render key");
                Check(cache.Current.Key != first.key, "layered render key is distinct from the backward-compatible legacy key");
                Check(server.Count("/layered/body/") == 5, "all five eyeless body sheets are downloaded and verified");
                Check(server.Count("/layered/eyes/ruby-eye-01.png") == 1, "one shared eye pair is downloaded once for five scenes");
                Check(server.Count("/layered/legacy/") == 0, "new desktop renderer does not download legacy precomposed fallbacks");
                Color firstLeft = cache.Current.Get("idle", 0, false).Image.GetPixel(4, 6);
                Color firstRight = cache.Current.Get("idle", 0, false).Image.GetPixel(14, 6);
                Check(firstLeft.ToArgb() == Color.Red.ToArgb() && firstRight.ToArgb() == Color.Blue.ToArgb(), "left and right eye tiles are composed at their independent anchors");
                foreach (string name in Names)
                {
                    DesktopAppearanceScene scene = first.scenes[name];
                    string file = Path.Combine(CachePath("layered"), scene.bodySha256 + ".png");
                    Check(File.Exists(file) && DesktopAppearanceCache.Hash(File.ReadAllBytes(file)) == scene.bodySha256, "verified eyeless body is content-addressed in cache: " + name);
                }
                string firstEyeFile = Path.Combine(CachePath("layered"), first.scenes["idle"].eyeSha256 + ".png");
                Check(File.Exists(firstEyeFile) && DesktopAppearanceCache.Hash(File.ReadAllBytes(firstEyeFile)) == first.scenes["idle"].eyeSha256, "verified eye pair is content-addressed in cache");

                var changedEye = LayeredDescriptor(server.Origin, "ruby-eye-03", "layered-eye-03");
                Check(first.key == changedEye.key && first.renderKey != changedEye.renderKey, "eye change keeps the legacy key stable and changes the render key");
                await Within(cache.UpdateAsync(changedEye, server.Origin), "changed layered eye appearance");
                Color changedLeft = cache.Current.Get("idle", 0, false).Image.GetPixel(4, 6);
                Color changedRight = cache.Current.Get("idle", 0, false).Image.GetPixel(14, 6);
                Check(cache.Current.Key == changedEye.renderKey, "changed eye replaces the current appearance despite a stable legacy key");
                Check(changedLeft.ToArgb() == Color.Lime.ToArgb() && changedRight.ToArgb() == Color.Gold.ToArgb(), "changed eye pixels are visible in the composed desktop output");
                Check(changedLeft.ToArgb() != firstLeft.ToArgb(), "eye-style change produces a different rendered bitmap");
                Check(server.Count("/layered/body/") == 5, "eye-only change reuses all verified body sheets");
                Check(server.Count("/layered/eyes/ruby-eye-03.png") == 1, "new eye pair is downloaded once");

                int bodyRequests = server.Count("/layered/body/");
                int selectedEyeRequests = server.Count("/layered/eyes/ruby-eye-03.png");
                await cache.UpdateAsync(changedEye, server.Origin);
                Check(server.Count("/layered/body/") == bodyRequests && server.Count("/layered/eyes/ruby-eye-03.png") == selectedEyeRequests, "same selected eye and render key do not trigger another download");
                var sameEyeNewRender = LayeredDescriptor(server.Origin, "ruby-eye-03", "layered-eye-03-new-render");
                await Within(cache.UpdateAsync(sameEyeNewRender, server.Origin), "same eye with a new render identity");
                Check(cache.Current.Key == sameEyeNewRender.renderKey, "new render identity is applied from cached layer files");
                Check(server.Count("/layered/body/") == bodyRequests && server.Count("/layered/eyes/ruby-eye-03.png") == selectedEyeRequests, "same selected eye is not re-downloaded when recomposition is requested");

                int requestsBeforeMalformed = server.Snapshot().Length;
                var malformed = LayeredDescriptor(server.Origin, "ruby-eye-03", "layered-malformed");
                malformed.scenes["happy"].eyeAnchors = null;
                await cache.UpdateAsync(malformed, server.Origin);
                Check(cache.Current != null && cache.Current.Key == sameEyeNewRender.renderKey, "malformed layered descriptor keeps the previous appearance");
                Check(server.Snapshot().Length == requestsBeforeMalformed, "malformed layered descriptor is rejected before downloads");

                foreach (string failure in new[] { "body-hash", "body-dimension", "eye-hash", "eye-dimension" })
                {
                    var bad = LayeredDescriptor(server.Origin, "ruby-eye-03", "layered-failure-" + failure);
                    DesktopAppearanceScene idle = bad.scenes["idle"];
                    string path = "/layered/bad/" + failure + ".png";
                    if (failure.StartsWith("body", StringComparison.Ordinal))
                    {
                        idle.bodyUrl = server.Origin + path;
                        idle.bodySha256 = failure == "body-hash" ? new string('0', 64) : DesktopAppearanceCache.Hash(FixtureImages[path]);
                    }
                    else
                    {
                        idle.eyeUrl = server.Origin + path;
                        idle.eyeSha256 = failure == "eye-hash" ? new string('0', 64) : DesktopAppearanceCache.Hash(FixtureImages[path]);
                    }
                    int before = server.Count(path);
                    await Within(cache.UpdateAsync(bad, server.Origin), failure + " layered download rejection");
                    Check(server.Count(path) == before + 1, failure + " fixture is fetched for validation");
                    Check(cache.Current != null && cache.Current.Key == sameEyeNewRender.renderKey, failure + " cannot replace the last valid appearance");
                    Check(cache.Status.Contains("마지막 모습을 유지"), failure + " reports that the last valid appearance is retained");
                }
            }
            Done("layered body/eye HTTP verification, eye recomposition, render-key invalidation, cache reuse, failure retention");
        }

        private static void Validation()
        {
            const string origin = "http://127.0.0.1:3000";
            foreach (string url in new[] { "http://example.com/dog.png", "http://127.0.0.1:3001/dog.png", "https://example.com/dog.png?token=secret", "https://user:pass@example.com/dog.png", "https://example.com/dog.png#frame", "file:///C:/dog.png", "https://example.com/dog.svg" })
                Reject(delegate { DesktopAppearanceCache.ValidateAssetUrl(url, origin); }, "reject unsafe image address");
            Reject(delegate { DesktopAppearanceCache.ValidateAssetUrl("http://127.0.0.1:3000/dog.png", "https://puppyruby.com"); }, "public site cannot point at a local HTTP service");
            Check(DesktopAppearanceCache.ValidateAssetUrl("https://cdn.puppyruby.com/site-assets/hash/dog.png", origin).Scheme == "https", "public CDN is accepted");
            Check(DesktopAppearanceCache.ValidateAssetUrl(origin + "/dog.png", origin).IsLoopback, "same-origin local development PNG is accepted");
            foreach (string issue in new[] { "unknown-breed", "missing-scene", "extra-scene", "invalid-key", "too-many-frames", "huge-canvas" })
            {
                var value = Descriptor(origin, "valid", issue);
                if (issue == "unknown-breed") value.breedId = "not-registered";
                if (issue == "missing-scene") value.scenes.Remove("sleep");
                if (issue == "extra-scene") value.scenes["extra"] = value.scenes["idle"];
                if (issue == "invalid-key") value.key = "../not-a-hash";
                if (issue == "too-many-frames") value.scenes["walk"].frames = 9;
                if (issue == "huge-canvas") { value.width = 4096; value.height = 4096; }
                Reject(delegate { DesktopAppearanceCache.Validate(value, origin); }, issue);
            }
            Done("URL/origin constraints and malformed descriptor rejection");
        }

        private static async Task Run(string projectRoot)
        {
            foreach (string name in Names) Images.Add(name, File.ReadAllBytes(Path.Combine(projectRoot, "local-assets", "site", "images", "art16-scenes-v1", "pomeranian", name + ".png")));
            PrepareLayeredFixtureImages();
            Validation();
            var decoded = new Dictionary<string, Bitmap>();
            foreach (string name in Names)
            {
                using (var stream = new MemoryStream(Images[name]))
                using (var bitmap = new Bitmap(stream)) decoded.Add(name, new Bitmap(bitmap));
            }
            using (var frames = new DesktopAppearanceFrames(Descriptor("http://127.0.0.1:3000", "probe", "probe"), decoded))
                Check(frames.Get("idle", 0, false).Image.Width == 369, "native renderer accepts real PNG sheets");
            await InitialAndOffline();
            await CorruptionAndFailures();
            await Races();
            await StaticStyleAndRevert();
            await LayeredEyeDownloadsAndCache();
        }

        private static int Main(string[] args)
        {
            try
            {
                if (args.Length != 2) throw new ArgumentException("Supply repository root and a workspace test output directory.");
                string projectRoot = Path.GetFullPath(args[0]).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                outputRoot = Path.GetFullPath(args[1]);
                string workRoot = Path.Combine(projectRoot, "local-assets", "work") + Path.DirectorySeparatorChar;
                if (!outputRoot.StartsWith(workRoot, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Test output must be inside this repository's local-assets/work directory.");
                Directory.CreateDirectory(outputRoot);
                Run(projectRoot).GetAwaiter().GetResult();
                File.WriteAllText(Path.Combine(outputRoot, "report.json"), new JavaScriptSerializer().Serialize(new { passed = true, checks = checks, scenarios = Results.ToArray(), source = "real art16 PNG files", network = "loopback TCP HTTP fixture only", cache = outputRoot }), Encoding.UTF8);
                Console.WriteLine("Desktop appearance cache: " + checks + " checks passed."); return 0;
            }
            catch (Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
        }
    }
}
