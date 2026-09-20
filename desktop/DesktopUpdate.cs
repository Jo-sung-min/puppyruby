using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class DesktopUpdateManifest
    {
        internal readonly Version Version;
        internal readonly string Release, PublishedAt, Notes, InstallerUrl, Sha256;
        internal readonly long Size;
        internal const long MaximumInstallerSize = 256L * 1024 * 1024;

        private DesktopUpdateManifest(Version version, string release, string published, string notes, string url, string sha, long size)
        { Version = version; Release = release; PublishedAt = published; Notes = notes; InstallerUrl = url; Sha256 = sha; Size = size; }

        private static string Text(IDictionary<string, object> data, string key, int maximum)
        {
            object value;
            if (!data.TryGetValue(key, out value) || !(value is string) || ((string)value).Length > maximum)
                throw new InvalidDataException("업데이트 안내 형식을 확인하지 못했어요.");
            return (string)value;
        }

        private static long Integer(IDictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || !(value is int || value is long))
                throw new InvalidDataException("업데이트 파일 크기를 확인하지 못했어요.");
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }

        internal static DesktopUpdateManifest Parse(string source)
        {
            if (String.IsNullOrEmpty(source) || source.Length > 16384) throw new InvalidDataException("업데이트 안내가 너무 커요.");
            var json = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 8 };
            Dictionary<string, object> data;
            try { data = json.Deserialize<Dictionary<string, object>>(source); }
            catch (Exception error)
            {
                if (!(error is ArgumentException || error is InvalidOperationException)) throw;
                throw new InvalidDataException("업데이트 안내를 읽지 못했어요.", error);
            }
            if (data == null || Integer(data, "schemaVersion") != 1) throw new InvalidDataException("지원하지 않는 업데이트 안내예요.");
            string versionText = Text(data, "version", 40);
            Version version;
            if (!Regex.IsMatch(versionText, @"^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$") || !System.Version.TryParse(versionText, out version))
                throw new InvalidDataException("업데이트 버전을 확인하지 못했어요.");
            string release = Text(data, "release", 16), published = Text(data, "publishedAt", 40), notes = Text(data, "notes", 2000);
            DateTimeOffset publishedDate;
            if (!Regex.IsMatch(release, "^[0-9a-f]{16}$") || !Regex.IsMatch(published, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$") ||
                !DateTimeOffset.TryParse(published, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out publishedDate))
                throw new InvalidDataException("업데이트 배포 정보를 확인하지 못했어요.");
            object installerObject;
            if (!data.TryGetValue("installer", out installerObject)) throw new InvalidDataException("업데이트 파일이 없어요.");
            var installer = installerObject as Dictionary<string, object>;
            if (installer == null) throw new InvalidDataException("업데이트 파일 안내가 올바르지 않아요.");
            string url = Text(installer, "url", 240), hash = Text(installer, "sha256", 64);
            string expectedUrl = "https://cdn.puppyruby.com/site-downloads/" + release + "/downloads/PuppyRuby-Setup.exe";
            long size = Integer(installer, "size");
            // An exact URL also rejects credentials, alternate ports, queries, traversal and escaped separators.
            if (url != expectedUrl || !Regex.IsMatch(hash, "^[0-9a-f]{64}$") || size <= 0 || size > MaximumInstallerSize)
                throw new InvalidDataException("공식 업데이트 파일인지 확인하지 못했어요.");
            return new DesktopUpdateManifest(version, release, published, notes, url, hash, size);
        }
    }

    // The web pairing credential is deliberately never passed to this public, tightly bounded client.
    internal sealed class DesktopUpdate : IDisposable
    {
        private readonly bool enabled;
        private readonly HttpClient http;
        private readonly Version currentVersion;
        private readonly string updateDirectory;
        private readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private DateTime nextAutomaticCheck = DateTime.MinValue;
        private string lastCheckOrigin;
        private volatile bool disposed;
        internal event Action Changed;
        internal DesktopUpdateManifest Available { get; private set; }
        internal bool Checking { get; private set; }
        internal bool Downloading { get; private set; }
        internal int ProgressPercent { get; private set; }
        internal string Status { get; private set; }

        internal DesktopUpdate(bool enabled)
            : this(enabled, new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, UseDefaultCredentials = false },
                  Assembly.GetExecutingAssembly().GetName().Version,
                  Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PuppyRuby", "updates")) { }

        // Injectable transport and isolated storage are used by the offline regression tests.
        internal DesktopUpdate(bool enabled, HttpMessageHandler transport, Version current, string directory)
        {
            this.enabled = enabled; currentVersion = current; updateDirectory = Path.GetFullPath(directory);
            http = new HttpClient(transport) { Timeout = Timeout.InfiniteTimeSpan };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("PuppyRuby/" + currentVersion.ToString());
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Status = enabled ? "업데이트를 확인할 수 있어요" : "업데이트 확인이 꺼져 있어요";
        }

        internal static string ValidateUpdateOrigin(string value)
        {
            Uri uri;
            if (!Uri.TryCreate((value ?? "").Trim(), UriKind.Absolute, out uri) || !String.IsNullOrEmpty(uri.UserInfo) ||
                !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/")
                throw new ArgumentException("업데이트를 확인할 사이트 주소가 올바르지 않아요.");
            bool official = uri.Scheme == "https" && uri.IsDefaultPort && (uri.Host == "puppyruby.com" || uri.Host == "www.puppyruby.com");
            bool local = (uri.Scheme == "http" || uri.Scheme == "https") && uri.IsLoopback;
            if (!official && !local) throw new ArgumentException("공식 퍼피루비 사이트에서만 업데이트를 확인할 수 있어요.");
            return official ? "https://www.puppyruby.com" : uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        }

        private void Announce()
        {
            Action handler = Changed;
            if (!disposed && handler != null) handler();
        }

        internal async Task CheckAsync(string siteOrigin, bool manual = false)
        {
            string requestedOrigin = (siteOrigin ?? "").Trim().TrimEnd('/');
            if (!enabled || disposed || (!manual && String.Equals(requestedOrigin, lastCheckOrigin, StringComparison.OrdinalIgnoreCase) && DateTime.UtcNow < nextAutomaticCheck) || !await gate.WaitAsync(0)) return;
            lastCheckOrigin = requestedOrigin;
            Checking = true; Status = "새 업데이트를 확인하고 있어요…"; Announce();
            try
            {
                string origin = ValidateUpdateOrigin(siteOrigin);
                using (var cancel = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
                {
                    cancel.CancelAfter(TimeSpan.FromSeconds(12));
                    Uri address = new Uri(origin + "/api/desktop/update");
                    HttpResponseMessage response = await http.GetAsync(address, HttpCompletionOption.ResponseHeadersRead, cancel.Token);
                    try
                    {
                        if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400)
                        {
                            // Official inputs already resolve directly to www. Never fall back to the
                            // bare host, another origin, or a redirect loop after that canonical request.
                            throw new InvalidDataException("업데이트 확인 주소가 바뀌었어요. 잠시 후 다시 시도해 주세요.");
                        }
                        byte[] bytes;
                        // Closing the response also bounds older framework streams that ignore ReadAsync cancellation.
                        using (cancel.Token.Register(delegate { response.Dispose(); }))
                        {
                            if (!response.IsSuccessStatusCode) throw new HttpRequestException("업데이트 서버에 연결하지 못했어요.");
                            if (response.Content.Headers.ContentLength > 16384) throw new InvalidDataException("업데이트 안내가 너무 커요.");
                            using (Stream input = await response.Content.ReadAsStreamAsync())
                            using (var output = new MemoryStream())
                            {
                                byte[] buffer = new byte[4096]; int read;
                                while ((read = await input.ReadAsync(buffer, 0, buffer.Length, cancel.Token)) > 0)
                                {
                                    if (output.Length + read > 16384) throw new InvalidDataException("업데이트 안내가 너무 커요.");
                                    output.Write(buffer, 0, read);
                                }
                                bytes = output.ToArray();
                            }
                        }
                        DesktopUpdateManifest manifest = DesktopUpdateManifest.Parse(new UTF8Encoding(false, true).GetString(bytes));
                        cancel.Token.ThrowIfCancellationRequested();
                        if (!disposed)
                        {
                            Available = manifest.Version > currentVersion ? manifest : null;
                            Status = Available == null ? "최신 버전을 사용하고 있어요" : "새 강아지 업데이트가 있어요 · " + manifest.Version;
                            nextAutomaticCheck = DateTime.UtcNow.AddMinutes(30);
                        }
                    }
                    finally { response.Dispose(); }
                }
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                if (!disposed)
                {
                    Status = Available == null ? "업데이트를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." : "새 업데이트가 있어요 · 연결되면 다시 받을 수 있어요";
                    nextAutomaticCheck = DateTime.UtcNow.AddMinutes(15);
                }
            }
            finally { Checking = false; gate.Release(); Announce(); }
        }

        internal async Task<string> DownloadAsync()
        {
            if (!enabled || disposed) throw new InvalidOperationException("업데이트를 받을 수 없는 상태예요.");
            if (!await gate.WaitAsync(0)) throw new InvalidOperationException("이전 업데이트 작업이 끝날 때까지 기다려 주세요.");
            string staged = null;
            Downloading = true; ProgressPercent = 0; Status = "업데이트를 받고 있어요…"; Announce();
            try
            {
                DesktopUpdateManifest manifest = Available;
                if (manifest == null || manifest.Version <= currentVersion) throw new InvalidOperationException("받을 업데이트가 없어요.");
                Directory.CreateDirectory(updateDirectory);
                if ((File.GetAttributes(updateDirectory) & FileAttributes.ReparsePoint) != 0) throw new IOException("업데이트 폴더를 사용할 수 없어요.");
                string destination = Path.Combine(updateDirectory, "PuppyRuby-Setup-" + manifest.Release + ".exe");
                if (File.Exists(destination) && VerifyInstaller(destination, manifest))
                { ProgressPercent = 100; Status = "업데이트 준비 완료"; return destination; }
                staged = Path.Combine(updateDirectory, ".download-" + Guid.NewGuid().ToString("N") + ".part");
                using (var cancel = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
                {
                    cancel.CancelAfter(TimeSpan.FromMinutes(5));
                    using (HttpResponseMessage response = await http.GetAsync(manifest.InstallerUrl, HttpCompletionOption.ResponseHeadersRead, cancel.Token))
                    using (cancel.Token.Register(delegate { response.Dispose(); }))
                    {
                        if (!response.IsSuccessStatusCode) throw new HttpRequestException("업데이트 파일을 받지 못했어요.");
                        if (response.Content.Headers.ContentLength.HasValue && response.Content.Headers.ContentLength.Value != manifest.Size)
                            throw new InvalidDataException("업데이트 파일 크기가 안내와 달라요. 다시 시도해 주세요.");
                        using (Stream input = await response.Content.ReadAsStreamAsync())
                        using (var output = new FileStream(staged, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
                        using (SHA256 digest = SHA256.Create())
                        {
                            byte[] buffer = new byte[65536]; long total = 0; int read;
                            while ((read = await input.ReadAsync(buffer, 0, buffer.Length, cancel.Token)) > 0)
                            {
                                total += read;
                                if (total > manifest.Size) throw new InvalidDataException("업데이트 파일이 안내된 크기보다 커요.");
                                await output.WriteAsync(buffer, 0, read, cancel.Token);
                                digest.TransformBlock(buffer, 0, read, buffer, 0);
                                int next = (int)(total * 99 / manifest.Size);
                                if (next != ProgressPercent) { ProgressPercent = next; Announce(); }
                            }
                            digest.TransformFinalBlock(new byte[0], 0, 0);
                            if (total != manifest.Size || HashText(digest.Hash) != manifest.Sha256)
                                throw new InvalidDataException("업데이트 파일 검증에 실패했어요. 다시 받아 주세요.");
                            output.Flush(true);
                        }
                        cancel.Token.ThrowIfCancellationRequested();
                        if (File.Exists(destination)) File.Replace(staged, destination, null); else File.Move(staged, destination);
                        staged = null;
                        ProgressPercent = 100; Status = "업데이트 준비 완료";
                        return destination;
                    }
                }
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                Status = "업데이트를 받지 못했어요. 다시 누르면 재시도할 수 있어요.";
                throw new InvalidOperationException(Status, error);
            }
            finally
            {
                if (staged != null) { try { if (File.Exists(staged)) File.Delete(staged); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
                Downloading = false; gate.Release(); Announce();
            }
        }

        internal static bool VerifyInstaller(string path, DesktopUpdateManifest manifest)
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) return false;
            using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (SHA256 hash = SHA256.Create()) return input.Length == manifest.Size && HashText(hash.ComputeHash(input)) == manifest.Sha256;
        }
        private static string HashText(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }
        private static bool Recoverable(Exception error)
        {
            return error is HttpRequestException || error is IOException || error is InvalidDataException || error is UnauthorizedAccessException ||
                error is ArgumentException || error is InvalidOperationException || error is OperationCanceledException || error is CryptographicException;
        }
        public void Dispose()
        {
            if (disposed) return;
            disposed = true; lifetime.Cancel(); http.Dispose();
            // In-flight operations still release the gate and linked cancellation sources in their finally blocks.
        }
    }
}
