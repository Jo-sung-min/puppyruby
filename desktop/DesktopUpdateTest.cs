using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using PuppyRubySetup;

namespace PuppyRubyDesktop
{
    internal static class DesktopUpdateTests
    {
        private static int checks;
        private static string root;
        private static string publishedManifestPath;
        private static readonly byte[] Payload = Encoding.UTF8.GetBytes("MZ puppy update fixture: only verified bytes can be handed to Setup");
        private static readonly string Release = "0123456789abcdef";
        private static void Check(bool passed, string detail) { if (!passed) throw new InvalidOperationException(detail); checks++; }
        private static string Hash(byte[] bytes) { using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        private static string Manifest(string version = "0.11.0.0", string url = null, string hash = null, long size = -1)
        {
            return new JavaScriptSerializer().Serialize(new {
                schemaVersion = 1, version = version, release = Release, publishedAt = "2026-09-20T09:00:00.000Z", notes = "새 강아지 동작과 눈",
                installer = new { url = url ?? ("https://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe"), sha256 = hash ?? Hash(Payload), size = size < 0 ? Payload.Length : size }
            });
        }
        private sealed class Stub : HttpMessageHandler
        {
            internal int Count;
            internal readonly List<string> RequestedUrls = new List<string>();
            internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Respond;
            internal Stub(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) { Respond = respond; }
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel)
            {
                Count++;
                RequestedUrls.Add(request.RequestUri.AbsoluteUri);
                Check(request.Headers.Authorization == null && !request.Headers.Contains("Cookie"), "no pairing credential/cookie is sent");
                return Respond(request, cancel);
            }
        }
        private static HttpResponseMessage Json(string value) { return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(value, Encoding.UTF8, "application/json") }; }
        private static HttpResponseMessage Binary(byte[] value) { return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(value) }; }
        private sealed class StreamingContent : HttpContent
        {
            private readonly Stream source;
            internal StreamingContent(Stream stream) { source = stream; }
            protected override bool TryComputeLength(out long length) { length = 0; return false; }
            protected override Task SerializeToStreamAsync(Stream stream, TransportContext context) { return source.CopyToAsync(stream); }
            protected override Task<Stream> CreateContentReadStreamAsync() { return Task.FromResult(source); }
            protected override void Dispose(bool disposing) { if (disposing) source.Dispose(); base.Dispose(disposing); }
        }
        private sealed class BlockedStream : Stream
        {
            internal readonly TaskCompletionSource<bool> Blocked = new TaskCompletionSource<bool>();
            private readonly TaskCompletionSource<int> remainder = new TaskCompletionSource<int>();
            private bool first = true;
            public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancel)
            {
                if (first) { first = false; Array.Copy(Payload, 0, buffer, offset, 4); return Task.FromResult(4); }
                Blocked.TrySetResult(true); return remainder.Task;
            }
            protected override void Dispose(bool disposing) { remainder.TrySetException(new ObjectDisposedException("response stream")); base.Dispose(disposing); }
            public override bool CanRead { get { return true; } } public override bool CanSeek { get { return false; } } public override bool CanWrite { get { return false; } }
            public override long Length { get { throw new NotSupportedException(); } } public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
            public override int Read(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
            public override void Flush() { } public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
            public override void SetLength(long value) { throw new NotSupportedException(); } public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
        }
        private static Stub Routes(string manifest, Func<HttpResponseMessage> download)
        {
            return new Stub(delegate(HttpRequestMessage request, CancellationToken cancel) {
                return Task.FromResult(request.RequestUri.AbsolutePath == "/api/desktop/update" ? Json(manifest) : download());
            });
        }
        private static DesktopUpdate Client(Stub transport, string directory = null, bool enabled = true)
        { return new DesktopUpdate(enabled, transport, new Version("0.10.0.0"), directory ?? Path.Combine(root, Guid.NewGuid().ToString("N"))); }
        private static void Reject(string value, string detail)
        { bool rejected = false; try { DesktopUpdateManifest.Parse(value); } catch (InvalidDataException) { rejected = true; } Check(rejected, detail); }
        private static async Task RejectDownload(DesktopUpdate update, string directory, string detail)
        {
            bool rejected = false;
            try { await update.DownloadAsync(); } catch (InvalidOperationException) { rejected = true; }
            Check(rejected, detail);
            Check(update.Available != null && !update.Downloading, "failed download preserves retry availability");
            Check(!Directory.Exists(directory) || Directory.GetFiles(directory, "*.part").Length == 0, "failed download removes partial file");
            Check(!Directory.Exists(directory) || Directory.GetFiles(directory, "*.exe").Length == 0, "failed download exposes no executable");
        }

        private static async Task Run()
        {
            if (!String.IsNullOrEmpty(publishedManifestPath))
            {
                string publishedJson = File.ReadAllText(publishedManifestPath);
                DesktopUpdateManifest published = DesktopUpdateManifest.Parse(publishedJson);
                Check(published.Version > new Version("0.0.0.0"), "actual publisher output parses in .NET Framework client");
                foreach (Version current in new [] { new Version("0.0.0.0"), published.Version })
                {
                    var transport = Routes(publishedJson, delegate { throw new InvalidOperationException("Published installer must not be downloaded by this test."); });
                    using (var update = new DesktopUpdate(true, transport, current, Path.Combine(root, "published-" + current)))
                    {
                        await update.CheckAsync("https://puppyruby.com", true);
                        Check(current < published.Version ? update.Available != null && update.Available.Version == published.Version : update.Available == null && update.Status == "최신 버전을 사용하고 있어요",
                            "actual published contract compares version " + current + " correctly");
                        Check(transport.Count == 1, "published contract verification only reads manifest");
                    }
                }
            }
            DesktopUpdateManifest parsed = DesktopUpdateManifest.Parse(Manifest());
            Check(parsed.Version == new Version("0.11.0.0") && parsed.Size == Payload.Length && parsed.Sha256 == Hash(Payload), "valid manifest exact fields");
            foreach (string version in new [] { "1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "-1.2.3.4", "2147483648.1.1.1", "latest" }) Reject(Manifest(version), "malformed version: " + version);
            foreach (string url in new [] {
                "http://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe",
                "https://evil.example/PuppyRuby-Setup.exe",
                "https://cdn.puppyruby.com.evil.example/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe",
                "https://cdn.puppyruby.com:444/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe",
                "https://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/../PuppyRuby-Setup.exe",
                "https://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe?anything=1",
                "https://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe#fragment",
                "https://user:pass@cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe",
                "https://cdn.puppyruby.com/site-downloads/ffffffffffffffff/downloads/PuppyRuby-Setup.exe"
            }) Reject(Manifest("0.11.0.0", url), "untrusted installer URL rejected");
            Reject(Manifest(hash: new string('A', 64)), "uppercase/noncanonical digest rejected");
            Reject(Manifest(hash: new string('g', 64)), "invalid digest rejected");
            Reject(Manifest(size: 0), "zero size rejected");
            Reject(Manifest(size: DesktopUpdateManifest.MaximumInstallerSize + 1), "oversized installer rejected");
            Reject(Manifest().Replace("\"schemaVersion\":1", "\"schemaVersion\":2"), "unknown schema rejected");
            Reject(Manifest().Replace("2026-09-20T09:00:00.000Z", "September 20, 2026"), "non-ISO publication date rejected");
            Reject(Manifest().Replace("\"size\":" + Payload.Length, "\"size\":\"" + Payload.Length + "\""), "numeric string size rejected");
            Reject(Manifest().Replace("\"release\":\"" + Release + "\"", "\"release\":\"../anything\""), "unsafe release rejected");
            Reject("null", "null manifest rejected"); Reject("{broken", "malformed JSON rejected"); Reject(new string('x', 16385), "oversized JSON rejected");
            foreach (string origin in new [] { "https://puppyruby.com", "https://www.puppyruby.com/", "http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001" })
                Check(DesktopUpdate.ValidateUpdateOrigin(origin).StartsWith("http"), "supported official/loopback origin");
            foreach (string origin in new [] { "https://puppyruby.com", "https://puppyruby.com/", "https://www.puppyruby.com/", "HTTPS://PUPPYRUBY.COM:443/" })
            {
                Check(DesktopUpdate.ValidateUpdateOrigin(origin) == "https://www.puppyruby.com", "official origin normalized to www");
                var canonical = Routes(Manifest(), delegate { return Binary(Payload); });
                using (DesktopUpdate update = Client(canonical))
                {
                    await update.CheckAsync(origin, true);
                    Check(update.Available != null && canonical.Count == 1 && canonical.RequestedUrls[0] == "https://www.puppyruby.com/api/desktop/update", "official update request goes directly to www without redirect");
                }
            }
            foreach (string origin in new [] { "http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001" })
            {
                var local = Routes(Manifest(), delegate { return Binary(Payload); });
                using (DesktopUpdate update = Client(local))
                {
                    await update.CheckAsync(origin, true);
                    Check(update.Available != null && local.Count == 1 && local.RequestedUrls[0] == new Uri(origin + "/api/desktop/update").AbsoluteUri, "explicit development loopback is preserved");
                }
            }
            foreach (string origin in new [] { "https://evil.example", "http://puppyruby.com", "https://puppyruby.com.evil.example", "https://puppyruby.com:444", "https://u:p@puppyruby.com", "https://puppyruby.com/path", "https://puppyruby.com?x=1", "file:///x" })
            { bool failed = false; try { DesktopUpdate.ValidateUpdateOrigin(origin); } catch (ArgumentException) { failed = true; } Check(failed, "untrusted update origin rejected"); }

            foreach (string version in new [] { "0.9.9.9", "0.10.0.0", "0.10.0.1", "0.11.0.0", "1.0.0.0" })
            {
                var transport = Routes(Manifest(version), delegate { return Binary(Payload); });
                using (DesktopUpdate update = Client(transport))
                {
                    await update.CheckAsync("https://puppyruby.com", true);
                    Check((update.Available != null) == (new Version(version) > new Version("0.10.0.0")), "strict semantic version comparison " + version);
                    Check(!update.Checking, "check flag reset");
                }
            }
            string successfulDirectory = Path.Combine(root, "success");
            var good = Routes(Manifest(), delegate { return Binary(Payload); });
            using (DesktopUpdate update = Client(good, successfulDirectory))
            {
                int events = 0; update.Changed += delegate { events++; };
                await update.CheckAsync("http://127.0.0.1:3001", true);
                string path = await update.DownloadAsync();
                Check(good.RequestedUrls[1] == "https://cdn.puppyruby.com/site-downloads/" + Release + "/downloads/PuppyRuby-Setup.exe", "verified installer remains on the fixed CDN path");
                Check(File.Exists(path) && Hash(File.ReadAllBytes(path)) == Hash(Payload), "only exact verified bytes promoted");
                Check(Path.GetDirectoryName(path) == successfulDirectory && Path.GetFileName(path) == "PuppyRuby-Setup-" + Release + ".exe", "fixed safe cache filename");
                Check(update.ProgressPercent == 100 && !update.Downloading && events > 3, "progress and state notifications");
                int count = good.Count; Check(await update.DownloadAsync() == path && good.Count == count, "verified cached installer reused");
                File.WriteAllText(path, "corrupt");
                Check(await update.DownloadAsync() == path && good.Count == count + 1 && Hash(File.ReadAllBytes(path)) == Hash(Payload), "corrupt cached installer redownloaded atomically");
                await update.CheckAsync("http://127.0.0.1:3001");
                Check(good.Count == count + 1, "automatic checks throttled");
                await update.CheckAsync("https://puppyruby.com");
                Check(good.Count == count + 2, "link origin changes bypass old origin cooldown");
                good.Respond = delegate { throw new HttpRequestException("offline"); };
                await update.CheckAsync("https://puppyruby.com", true);
                Check(update.Available != null && !update.Checking, "offline check retains previously validated update");
                good.Respond = delegate { return Task.FromResult(Json("{}")); };
                await update.CheckAsync("https://puppyruby.com", true);
                Check(update.Available != null, "malformed refresh retains availability");
            }
            foreach (string failure in new [] { "hash", "length", "truncated", "redirect", "offline" })
            {
                string directory = Path.Combine(root, failure);
                var transport = Routes(Manifest(), delegate {
                    if (failure == "offline") throw new HttpRequestException("offline");
                    if (failure == "redirect") { var redirected = new HttpResponseMessage(HttpStatusCode.Redirect); redirected.Headers.Location = new Uri("https://evil.example/installer.exe"); return redirected; }
                    if (failure == "hash") return Binary(new byte[Payload.Length]);
                    if (failure == "truncated") { var truncated = Binary(new byte[Payload.Length - 1]); truncated.Content.Headers.ContentLength = Payload.Length; return truncated; }
                    return Binary(new byte[Payload.Length + 1]);
                });
                using (DesktopUpdate update = Client(transport, directory))
                { await update.CheckAsync("https://puppyruby.com", true); await RejectDownload(update, directory, "reject " + failure); }
                Check(transport.Count == 2, "no follow-up request on download failure " + failure);
            }
            foreach (string location in new [] { "https://puppyruby.com/api/desktop/update", "https://www.puppyruby.com/api/desktop/update", "http://www.puppyruby.com/api/desktop/update", "https://evil.example/api/desktop/update", "https://127.0.0.1/api/desktop/update", "https://www.puppyruby.com/other", "https://www.puppyruby.com/api/desktop/update?x=1", "https://u:p@www.puppyruby.com/api/desktop/update" })
            {
                var transport = new Stub(delegate { var result = new HttpResponseMessage(HttpStatusCode.Redirect); result.Headers.Location = new Uri(location); return Task.FromResult(result); });
                using (DesktopUpdate update = Client(transport)) { await update.CheckAsync("https://puppyruby.com", true); Check(update.Available == null && transport.Count == 1 && transport.RequestedUrls[0] == "https://www.puppyruby.com/api/desktop/update", "redirect cannot fall back from www or loop"); }
            }
            var huge = Routes(new string('x', 17000), delegate { return Binary(Payload); });
            using (DesktopUpdate update = Client(huge)) { await update.CheckAsync("https://puppyruby.com", true); Check(update.Available == null, "bounded HTTP manifest body"); }
            var disabled = Routes(Manifest(), delegate { return Binary(Payload); });
            using (DesktopUpdate update = Client(disabled, enabled: false)) { await update.CheckAsync("https://puppyruby.com", true); Check(disabled.Count == 0, "preview/test instances perform no network work"); }
            var pending = new TaskCompletionSource<HttpResponseMessage>();
            var slow = new Stub(delegate(HttpRequestMessage request, CancellationToken cancel) { cancel.Register(delegate { pending.TrySetCanceled(); }); return pending.Task; });
            using (DesktopUpdate update = Client(slow))
            {
                Task first = update.CheckAsync("https://puppyruby.com", true);
                await update.CheckAsync("https://puppyruby.com", true);
                Check(slow.Count == 1 && update.Checking, "checks are single flight");
                bool busy = false; try { await update.DownloadAsync(); } catch (InvalidOperationException) { busy = true; }
                Check(busy && slow.Count == 1, "download cannot race check");
                update.Dispose(); await first;
                Check(!update.Checking, "dispose cancels check and resets flags");
            }
            var cancelDownload = new TaskCompletionSource<HttpResponseMessage>();
            var cancelTransport = new Stub(delegate(HttpRequestMessage request, CancellationToken cancel) {
                if (request.RequestUri.AbsolutePath == "/api/desktop/update") return Task.FromResult(Json(Manifest()));
                cancel.Register(delegate { cancelDownload.TrySetCanceled(); }); return cancelDownload.Task;
            });
            string cancelledDirectory = Path.Combine(root, "cancelled");
            using (DesktopUpdate update = Client(cancelTransport, cancelledDirectory))
            {
                await update.CheckAsync("https://puppyruby.com", true);
                Task download = RejectDownload(update, cancelledDirectory, "dispose cancels download");
                Check(update.Downloading, "download started");
                update.Dispose(); await download;
            }
            foreach (int length in new [] { Payload.Length - 1, Payload.Length, Payload.Length + 1 })
            {
                string directory = Path.Combine(root, "stream-" + length);
                byte[] data = new byte[length]; Array.Copy(Payload, data, Math.Min(Payload.Length, length));
                var transport = Routes(Manifest(), delegate { return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamingContent(new MemoryStream(data)) }; });
                using (DesktopUpdate update = Client(transport, directory))
                {
                    await update.CheckAsync("https://puppyruby.com", true);
                    if (length == Payload.Length) Check(File.Exists(await update.DownloadAsync()), "exact chunked download accepted");
                    else await RejectDownload(update, directory, "chunked download enforces actual length " + length);
                }
            }
            var oversizedStream = new Stub(delegate { return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamingContent(new MemoryStream(new byte[17000])) }); });
            using (DesktopUpdate update = Client(oversizedStream)) { await update.CheckAsync("https://puppyruby.com", true); Check(update.Available == null, "chunked manifest bounded without Content-Length"); }
            var blocked = new BlockedStream();
            string partialDirectory = Path.Combine(root, "partial-cancellation");
            var partialTransport = Routes(Manifest(), delegate { return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamingContent(blocked) }; });
            using (DesktopUpdate update = Client(partialTransport, partialDirectory))
            {
                await update.CheckAsync("https://puppyruby.com", true);
                Task download = RejectDownload(update, partialDirectory, "cancel partial stream that ignores cancellation token");
                await blocked.Blocked.Task;
                Check(Directory.GetFiles(partialDirectory, "*.part").Length == 1, "partial download exists only as unexecutable staging file");
                update.Dispose(); await download;
            }
            TestSetupHandoff();
        }

        private static void TestSetupHandoff()
        {
            int parent;
            Check(SetupUpdate.TryParseArguments(new string[0], out parent) && parent == 0, "normal interactive setup retained");
            Check(SetupUpdate.TryParseArguments(new [] { "--update", "12345" }, out parent) && parent == 12345, "update handoff accepted");
            foreach (string[] args in new [] { new [] { "--update" }, new [] { "--update", "0" }, new [] { "--update", "-1" }, new [] { "--update", "anything" }, new [] { "--update", "1", "more" }, new [] { "--update", Process.GetCurrentProcess().Id.ToString() } })
                Check(!SetupUpdate.TryParseArguments(args, out parent), "invalid update PID rejected");
            SetupUpdate.WaitForParent(Int32.MaxValue, DateTime.UtcNow, 10); Check(true, "already exited requester accepted");
            bool unrelated = false;
            try { SetupUpdate.WaitForParent(Process.GetCurrentProcess().Id, DateTime.UtcNow, 10); } catch (InvalidOperationException) { unrelated = true; }
            Check(unrelated, "unrelated process cannot be handoff target");
            Check(SetupUpdate.IsPortablePuppy("PuppyRuby.exe", "PuppyRuby"), "renamed portable puppy retains original application identity");
            Check(!SetupUpdate.IsPortablePuppy("PuppyRuby-Setup.exe", "PuppyRuby") && !SetupUpdate.IsPortablePuppy("other.exe", "PuppyRuby") && !SetupUpdate.IsPortablePuppy("PuppyRuby.exe", "other"), "other executable metadata rejected");
            string fixture = Path.Combine(root, "PuppyRuby.exe");
            File.Copy(Assembly.GetExecutingAssembly().Location, fixture);
            using (Process process = Process.Start(new ProcessStartInfo(fixture, "--wait-fixture") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden }))
            {
                bool timedOut = false;
                try { SetupUpdate.WaitForParent(process.Id, DateTime.UtcNow.AddSeconds(1), 10); } catch (IOException) { timedOut = true; }
                Check(timedOut && !process.HasExited, "timeout is bounded and never kills requesting app");
                SetupUpdate.WaitForParent(process.Id, DateTime.UtcNow.AddSeconds(1), 5000);
                Check(process.HasExited, "wait succeeds after requester exits naturally");
            }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "--wait-fixture") { Thread.Sleep(600); return 0; }
            if (args.Length < 1 || args.Length > 2) return 2;
            root = Path.GetFullPath(args[0]); Directory.CreateDirectory(root);
            publishedManifestPath = args.Length == 2 ? Path.GetFullPath(args[1]) : null;
            try { Run().GetAwaiter().GetResult(); Console.WriteLine("PASS: " + checks + " desktop update checks (manifest, version, trust, integrity, cancellation, cache, handoff)"); return 0; }
            catch (Exception error) { Console.Error.WriteLine("FAIL after " + checks + " checks: " + error); return 1; }
        }
    }
}
