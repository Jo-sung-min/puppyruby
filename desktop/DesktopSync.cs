using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class SyncedPuppy
    {
        public string id { get; set; } public string name { get; set; } public int breed { get; set; }
        public string grade { get; set; } public int xp { get; set; }
        public int hunger { get; set; } public int happiness { get; set; } public int energy { get; set; }
        public string fur { get; set; } public string eyes { get; set; } public string accessory { get; set; }
        public long lastFeed { get; set; } public long lastPlay { get; set; } public long lastRest { get; set; } public long lastTrain { get; set; }
    }
    internal sealed class DesktopGameState
    {
        public SyncedPuppy puppy { get; set; } public int coins { get; set; } public int promotionXp { get; set; }
        public int obedience { get; set; } public long syncedAt { get; set; }
        public DesktopAppearance appearance { get; set; } public string appearanceError { get; set; }
    }
    internal sealed class DesktopDevice
    {
        public string id { get; set; } public string label { get; set; } public long createdAt { get; set; } public long lastSeen { get; set; }
    }
    internal sealed class PairResponse { public string token { get; set; } public DesktopDevice device { get; set; } public DesktopGameState state { get; set; } }
    internal sealed class DesktopActionResponse { public DesktopGameState state { get; set; } public bool success { get; set; } public string message { get; set; } }
    internal sealed class PendingDesktopAction
    {
        public string action { get; set; } public string puppyId { get; set; } public string value { get; set; } public string requestId { get; set; }
    }
    internal sealed class DesktopLinkRecord
    {
        public string origin { get; set; } public string token { get; set; } public string deviceId { get; set; } public string deviceLabel { get; set; }
        public DesktopGameState cachedState { get; set; } public PendingDesktopAction pending { get; set; }
    }

    internal static class LinkStorage
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("PuppyRuby.DesktopLink.v1");
        internal static void Save(string path, DesktopLinkRecord record)
        {
            if (String.IsNullOrEmpty(path)) return;
            byte[] raw = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(record));
            byte[] protectedData = ProtectedData.Protect(raw, Entropy, DataProtectionScope.CurrentUser);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string temporary = path + ".new";
            File.WriteAllBytes(temporary, protectedData);
            if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
        }
        internal static DesktopLinkRecord Load(string path)
        {
            if (String.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            byte[] raw = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
            DesktopLinkRecord record = new JavaScriptSerializer().Deserialize<DesktopLinkRecord>(Encoding.UTF8.GetString(raw));
            if (record == null || String.IsNullOrWhiteSpace(record.token)) throw new InvalidDataException("연결 정보가 비어 있어요.");
            record.origin = DesktopSync.ValidateOrigin(record.origin);
            DesktopSync.ValidateState(record.cachedState);
            return record;
        }
        internal static void Clear(string path)
        {
            if (!String.IsNullOrEmpty(path) && File.Exists(path)) File.Delete(path);
        }
    }

    internal sealed class DesktopApiException : Exception
    {
        internal readonly int StatusCode;
        internal DesktopApiException(int status, string message) : base(message) { StatusCode = status; }
    }

    internal sealed class DesktopSync : IDisposable
    {
        internal const string DefaultOrigin = "https://www.puppyruby.com";
        private const string LegacyOrigin = "https://puppyruby.com";
        private readonly string storagePath;
        private readonly HttpClient http;
        private readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private DesktopLinkRecord link;
        private CancellationTokenSource cancellation = new CancellationTokenSource();
        private int generation;
        private bool disposed;
        internal event Action Changed;
        internal bool Online { get; private set; }
        internal bool IsLinked { get { return link != null; } }
        internal bool Busy { get; private set; }
        internal bool CanAct { get { return IsLinked && Online && !Busy; } }
        internal DesktopGameState State { get { return link == null ? null : link.cachedState; } }
        internal string Origin { get { return link == null ? DefaultOrigin : link.origin; } }
        internal string DeviceLabel { get { return link == null ? "" : link.deviceLabel; } }
        internal string DeviceId { get { return link == null ? "" : link.deviceId; } }
        internal bool HasPending { get { return link != null && link.pending != null; } }
        internal string PendingDescription { get { return HasPending ? link.pending.action + " · " + (link.pending.value ?? "") : ""; } }
        internal string Status { get; private set; }

        internal DesktopSync(string path, bool load)
        {
            storagePath = path;
            // Never follow a redirect carrying a pairing code or bearer token.
            var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, UseDefaultCredentials = false };
            http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(25) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("PuppyRuby/0.9");
            // Older installed clients receive the five precomposed fallback scenes.
            // This client understands native actions and per-frame painted closed eyes.
            http.DefaultRequestHeaders.Add("X-PuppyRuby-Appearance-Version", "4");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Status = "이 PC에서만 키우는 강아지";
            if (load)
            {
                try { link = LinkStorage.Load(storagePath); if (link != null) Status = "웹 연결 확인 중 · 마지막 강아지를 보여 줘요"; }
                catch (Exception error) { if (!(error is IOException || error is UnauthorizedAccessException || error is CryptographicException || error is ArgumentException || error is InvalidDataException || error is InvalidOperationException)) throw; Status = "연결 정보를 읽지 못했어요. 다시 연결해 주세요."; }
            }
        }

        internal static string ValidateOrigin(string value)
        {
            Uri uri;
            if (!Uri.TryCreate((value ?? "").Trim(), UriKind.Absolute, out uri) ||
                (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)) ||
                !String.IsNullOrEmpty(uri.UserInfo) || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/")
                throw new ArgumentException("사이트의 기본 주소만 입력해 주세요. 기본 주소는 " + DefaultOrigin + " 이에요. 로컬 개발에서는 http://127.0.0.1:3000 주소도 사용할 수 있어요.");
            string origin = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
            return String.Equals(origin, LegacyOrigin, StringComparison.OrdinalIgnoreCase) ? DefaultOrigin : origin;
        }
        internal static void ValidateState(DesktopGameState value)
        {
            if (value == null || value.puppy == null || String.IsNullOrWhiteSpace(value.puppy.id) ||
                String.IsNullOrWhiteSpace(value.puppy.name) || Progression.GradeIndex(value.puppy.grade) < 0 || value.puppy.breed < 0 || value.puppy.breed >= DesktopBreedCatalog.Ids.Length || value.puppy.xp < 0 || value.promotionXp <= 0)
                throw new InvalidDataException("웹 강아지 정보를 읽지 못했어요.");
        }
        private void Announce() { Action handler = Changed; if (!disposed && handler != null) handler(); }
        private void Persist()
        {
            try { if (link != null) LinkStorage.Save(storagePath, link); }
            catch (Exception error) { if (!(error is IOException || error is UnauthorizedAccessException || error is CryptographicException)) throw; Status += " · 이 PC에 연결 정보를 저장하지 못했어요"; }
        }
        private async Task<T> Send<T>(string origin, string path, object body, string token, CancellationToken cancel)
        {
            using (var request = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, new Uri(ValidateOrigin(origin) + "/api/desktop/" + path)))
            {
                if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (body != null) request.Content = new StringContent(json.Serialize(body), Encoding.UTF8, "application/json");
                using (HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancel))
                {
                    string content = await response.Content.ReadAsStringAsync();
                    if (!response.IsSuccessStatusCode)
                    {
                        string message = "웹 연결 요청을 완료하지 못했어요.";
                        if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400) message = "사이트가 다른 주소로 이동했어요. 새 기본 주소로 다시 연결해 주세요.";
                        else { try { var data = json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(content); if (data != null && data.ContainsKey("message")) message = Convert.ToString(data["message"]); } catch (ArgumentException) { } }
                        throw new DesktopApiException((int)response.StatusCode, message);
                    }
                    try { return json.Deserialize<T>(content); }
                    catch (ArgumentException) { throw new InvalidDataException("사이트 응답을 읽지 못했어요."); }
                }
            }
        }

        internal async Task PairAsync(string origin, string code, string label)
        {
            origin = ValidateOrigin(origin);
            code = (code ?? "").Replace(" ", "").Replace("-", "").ToUpperInvariant();
            if (code.Length != 12) throw new ArgumentException("사이트에 표시된 12자리 연결 코드를 입력해 주세요.");
            if (String.IsNullOrWhiteSpace(label) || label.Length > 40) throw new ArgumentException("기기 이름을 1~40자로 입력해 주세요.");
            if (!await gate.WaitAsync(0)) throw new InvalidOperationException("이전 연결 요청을 확인하고 있어요. 잠시 후 다시 눌러 주세요.");
            int stamp = generation; Busy = true; Announce();
            try
            {
                PairResponse response = await Send<PairResponse>(origin, "pair", new { code = code, deviceName = label.Trim() }, null, cancellation.Token);
                if (stamp != generation || disposed) return;
                if (response == null || String.IsNullOrWhiteSpace(response.token) || response.device == null) throw new InvalidDataException("연결 응답을 읽지 못했어요.");
                ValidateState(response.state);
                link = new DesktopLinkRecord { origin = origin, token = response.token, deviceId = response.device.id, deviceLabel = response.device.label, cachedState = response.state };
                Online = true; Status = "웹과 연결됨 · " + response.state.puppy.name; Persist();
            }
            finally { Busy = false; gate.Release(); Announce(); }
        }

        internal async Task<bool> PollAsync()
        {
            if (disposed || link == null || !await gate.WaitAsync(0)) return false;
            int stamp = generation; DesktopLinkRecord current = link;
            try
            {
                DesktopGameState next = await Send<DesktopGameState>(current.origin, "state", null, current.token, cancellation.Token);
                if (stamp != generation || disposed) return false;
                ValidateState(next); current.cachedState = next; Online = true;
                Status = HasPending ? "웹과 연결됨 · 이전 동작 결과를 다시 확인해 주세요" : "웹과 연결됨 · " + next.puppy.name;
                Persist(); return true;
            }
            catch (DesktopApiException error)
            {
                if (stamp != generation || disposed) return false;
                if (error.StatusCode == 401 || error.StatusCode == 403) Disconnect("웹에서 연결이 해제되었어요. 이 PC의 강아지로 돌아왔어요.");
                else { Online = false; Status = error.Message; }
                return false;
            }
            catch (Exception error)
            {
                if (!(error is HttpRequestException || error is TaskCanceledException || error is InvalidDataException)) throw;
                if (stamp == generation && !disposed) { Online = false; Status = "사이트에 연결할 수 없어요 · 마지막 강아지를 보여 줘요"; }
                return false;
            }
            finally { gate.Release(); Announce(); }
        }

        internal async Task<DesktopActionResponse> ActAsync(string action, string puppyId, string value)
        {
            if (!IsLinked || !Online) throw new InvalidOperationException("웹 연결을 확인한 뒤 돌봄·훈련을 할 수 있어요. 오프라인 경험치는 쌓이지 않아요.");
            if (!await gate.WaitAsync(0)) throw new InvalidOperationException("이전 요청을 확인하고 있어요. 잠시 후 다시 눌러 주세요.");
            int stamp = generation; DesktopLinkRecord current = link;
            Busy = true; Announce();
            DesktopApiException selectedConflict = null;
            try
            {
                bool exactRetry = current.pending != null && current.pending.action == action && current.pending.puppyId == puppyId && current.pending.value == value;
                if (current.cachedState.puppy.id != puppyId && !exactRetry) throw new InvalidOperationException("선택한 강아지가 바뀌었어요. 새 강아지를 확인하고 다시 요청해 주세요.");
                if (current.pending != null && (current.pending.action != action || current.pending.puppyId != puppyId || current.pending.value != value))
                    throw new InvalidOperationException("이전 동작의 결과가 아직 확실하지 않아요. ‘연결 상태’에서 같은 요청을 다시 확인해 주세요.");
                if (current.pending == null) current.pending = new PendingDesktopAction { action = action, puppyId = puppyId, value = value, requestId = Guid.NewGuid().ToString() };
                Persist();
                DesktopActionResponse response = await Send<DesktopActionResponse>(current.origin, "action", current.pending, current.token, cancellation.Token);
                if (stamp != generation || disposed) throw new OperationCanceledException();
                if (response == null) throw new InvalidDataException("동작 결과를 읽지 못했어요.");
                ValidateState(response.state); current.cachedState = response.state; current.pending = null;
                Online = true; Status = "웹과 연결됨 · " + response.state.puppy.name; Persist(); return response;
            }
            catch (DesktopApiException error)
            {
                if (stamp == generation && !disposed)
                {
                    if (error.StatusCode == 401 || error.StatusCode == 403) Disconnect("웹에서 연결이 해제되었어요. 이 PC의 강아지로 돌아왔어요.");
                    else if (error.StatusCode < 500)
                    {
                        current.pending = null; Persist();
                        if (error.StatusCode == 409) Online = false;
                        Status = error.Message;
                    }
                    else { Online = false; Status = "동작 결과 확인이 필요해요 · 같은 요청만 다시 확인할 수 있어요"; }
                }
                if (error.StatusCode == 409) selectedConflict = error; else throw;
            }
            catch (Exception error)
            {
                if (!(error is HttpRequestException || error is TaskCanceledException || error is InvalidDataException)) throw;
                if (stamp == generation && !disposed) { Online = false; Status = "동작 결과가 아직 확인되지 않았어요 · 연결 후 같은 요청을 다시 확인해 주세요"; }
                throw new InvalidOperationException("연결이 끊겨 결과를 확인하지 못했어요. 같은 요청을 다시 확인하면 경험치가 중복 지급되지 않아요.");
            }
            finally { Busy = false; gate.Release(); Announce(); }
            // C# 5 cannot await inside catch. Refresh only after releasing the
            // serialized request slot, and never replay the rejected action.
            if (selectedConflict != null)
            {
                if (stamp == generation && !disposed && IsLinked) await PollAsync();
                throw selectedConflict;
            }
            throw new InvalidOperationException("웹 동작 결과를 확인하지 못했어요.");
        }
        internal Task<DesktopActionResponse> RetryPendingAsync()
        {
            if (!HasPending) throw new InvalidOperationException("확인할 이전 요청이 없어요.");
            return ActAsync(link.pending.action, link.pending.puppyId, link.pending.value);
        }
        internal void Disconnect(string message)
        {
            generation++; cancellation.Cancel(); cancellation.Dispose(); cancellation = new CancellationTokenSource();
            link = null; Online = false; Status = message;
            try { LinkStorage.Clear(storagePath); }
            catch (IOException) { Status += " 연결 파일은 직접 지워 주세요."; }
            catch (UnauthorizedAccessException) { Status += " 연결 파일은 직접 지워 주세요."; }
            Announce();
        }
        public void Dispose()
        {
            if (disposed) return; disposed = true; generation++; cancellation.Cancel(); cancellation.Dispose(); http.Dispose();
        }
    }
}
