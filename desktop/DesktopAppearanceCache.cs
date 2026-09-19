using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace PuppyRubyDesktop
{
    internal sealed class DesktopEyeAnchor
    {
        public int x { get; set; } public int y { get; set; }
        public int width { get; set; } public int height { get; set; }
    }
    internal sealed class DesktopAppearanceScene
    {
        public string url { get; set; } public string sha256 { get; set; }
        public int frames { get; set; } public int frameMs { get; set; }
        // New clients compose these verified layers. Older clients ignore the
        // extra JSON fields and keep using the default-eye image above.
        public string bodyUrl { get; set; } public string bodySha256 { get; set; } public int bodyFrames { get; set; }
        public string eyeUrl { get; set; } public string eyeSha256 { get; set; } public string eyeStyle { get; set; }
        public DesktopEyeAnchor[][] eyeAnchors { get; set; }
        internal bool HasLayeredFields
        {
            get
            {
                return bodyUrl != null || bodySha256 != null || bodyFrames != 0 || eyeUrl != null || eyeSha256 != null
                    || eyeStyle != null || eyeAnchors != null;
            }
        }
        internal int EffectiveFrames { get { return HasLayeredFields ? bodyFrames : frames; } }
    }
    internal sealed class DesktopAppearance
    {
        public int version { get; set; } public string key { get; set; } public string renderKey { get; set; }
        public string styleId { get; set; } public string styleName { get; set; } public string breedId { get; set; }
        public string accessory { get; set; }
        public DesktopEyeAnchor[] reactionEyes { get; set; }
        public int width { get; set; } public int height { get; set; }
        public Dictionary<string, DesktopAppearanceScene> scenes { get; set; }
        internal string EffectiveKey { get { return String.IsNullOrEmpty(renderKey) ? key : renderKey; } }
    }

    // Image requests never share the device client's bearer token, cookies or redirects.
    // The signed-in site's descriptor identifies immutable, hash-checked public PNGs.
    internal sealed class DesktopAppearanceCache : IDisposable
    {
        internal static readonly string[] Scenes = { "idle", "side", "walk", "happy", "sleep" };
        private const int MaxFileBytes = 12 * 1024 * 1024;
        private const long MaxDecodedPixels = 24L * 1024 * 1024;
        private static readonly Regex HashPattern = new Regex("^[a-fA-F0-9]{64}$", RegexOptions.CultureInvariant);
        private static readonly Regex EyeStylePattern = new Regex("^ruby-eye-(0[1-9]|[12][0-9]|30)$", RegexOptions.CultureInvariant);
        private readonly string directory;
        private readonly HttpClient http;
        private CancellationTokenSource pending;
        private string pendingKey;
        private string failedKey;
        private DateTime retryAt;
        private int generation;
        private bool disposed;
        internal event Action Changed;
        internal DesktopAppearanceFrames Current { get; private set; }
        internal string Status { get; private set; }
        internal bool Busy { get { return pendingKey != null; } }

        internal DesktopAppearanceCache(string path)
        {
            directory = String.IsNullOrWhiteSpace(path) ? null : Path.GetFullPath(path);
            http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, UseDefaultCredentials = false }) { Timeout = TimeSpan.FromSeconds(20) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("PuppyRuby/0.7");
            Status = "";
        }
        private void Announce() { Action changed = Changed; if (!disposed && changed != null) changed(); }

        internal static Uri ValidateAssetUrl(string value, string siteOrigin)
        {
            Uri site = new Uri(DesktopSync.ValidateOrigin(siteOrigin));
            Uri uri;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || !String.IsNullOrEmpty(uri.UserInfo)
                || !String.IsNullOrEmpty(uri.Fragment) || !String.IsNullOrEmpty(uri.Query)
                || (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback && site.IsLoopback && uri.Authority == site.Authority))
                || (uri.IsLoopback && !site.IsLoopback) || !uri.AbsolutePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("강아지 이미지 주소를 확인하지 못했어요.");
            return uri;
        }
        internal static void Validate(DesktopAppearance value, string origin)
        {
            if (value == null || value.version != 1 || value.key == null || !HashPattern.IsMatch(value.key)
                || String.IsNullOrWhiteSpace(value.styleId) || value.styleId.Length > 80
                || String.IsNullOrWhiteSpace(value.styleName) || value.styleName.Length > 120
                || Array.IndexOf(DesktopBreedCatalog.Ids, value.breedId) < 0
                || value.width < 1 || value.width > 2048 || value.height < 1 || value.height > 2048
                || value.scenes == null || value.scenes.Count != Scenes.Length)
                throw new InvalidDataException("웹에서 선택한 강아지 그림 정보를 확인하지 못했어요.");
            long pixels = 0;
            bool layered = false;
            bool allLayered = true;
            foreach (string name in Scenes)
            {
                DesktopAppearanceScene scene;
                if (!value.scenes.TryGetValue(name, out scene) || scene == null || scene.sha256 == null || !HashPattern.IsMatch(scene.sha256)
                    || scene.frames < 1 || scene.frames > 8 || (name != "walk" && scene.frames != 1)
                    || scene.frameMs < 50 || scene.frameMs > 2000 || (long)value.width * scene.frames > 32768)
                    throw new InvalidDataException("강아지 장면 정보를 확인하지 못했어요.");
                ValidateAssetUrl(scene.url, origin);
                if (scene.HasLayeredFields)
                {
                    layered = true;
                    if (value.styleId != "ruby-round-scenes" || String.IsNullOrWhiteSpace(scene.bodyUrl)
                        || scene.bodySha256 == null || !HashPattern.IsMatch(scene.bodySha256)
                        || scene.bodyFrames < 1 || scene.bodyFrames > 8
                        || (long)value.width * scene.bodyFrames > 32768
                        || String.IsNullOrWhiteSpace(scene.eyeUrl) || scene.eyeSha256 == null || !HashPattern.IsMatch(scene.eyeSha256)
                        || scene.eyeStyle == null || !EyeStylePattern.IsMatch(scene.eyeStyle)
                        || scene.eyeAnchors == null || scene.eyeAnchors.Length != scene.bodyFrames)
                        throw new InvalidDataException("강아지 눈 레이어 정보를 확인하지 못했어요.");
                    ValidateAssetUrl(scene.bodyUrl, origin); ValidateAssetUrl(scene.eyeUrl, origin);
                    foreach (DesktopEyeAnchor[] frame in scene.eyeAnchors)
                    {
                        if (frame == null || frame.Length < 1 || frame.Length > 2) throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
                        foreach (DesktopEyeAnchor eye in frame)
                            if (eye == null || eye.x < 0 || eye.y < 0 || eye.width < 1 || eye.height < 1
                                || eye.width > value.width / 3 || eye.height > value.height / 3
                                || eye.x + eye.width > value.width || eye.y + eye.height > value.height)
                                throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
                    }
                    pixels += (long)value.width * value.height * scene.bodyFrames;
                }
                else
                {
                    allLayered = false;
                    pixels += (long)value.width * value.height * scene.frames;
                }
            }
            if (layered && (value.renderKey == null || !HashPattern.IsMatch(value.renderKey)
                || !allLayered || !DesktopAccessoryRenderer.IsSupported(value.accessory)))
                throw new InvalidDataException("강아지 눈 레이어 정보를 확인하지 못했어요.");
            if (layered && value.reactionEyes != null)
            {
                if (value.reactionEyes.Length != 2) throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
                foreach (DesktopEyeAnchor eye in value.reactionEyes)
                    if (eye == null || eye.x < 0 || eye.y < 0 || eye.width < 4 || eye.height < 4
                        || eye.x + eye.width > value.width || eye.y + eye.height > value.height)
                        throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
            }
            if (!layered && (value.renderKey != null || (!String.IsNullOrEmpty(value.accessory) && value.accessory != "none"))) throw new InvalidDataException("강아지 눈 레이어 정보를 확인하지 못했어요.");
            if (pixels > MaxDecodedPixels) throw new InvalidDataException("강아지 그림이 너무 커서 불러올 수 없어요.");
        }
        internal static string Hash(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create()) return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }
        private static int BigEndian(byte[] data, int offset) { return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]; }
        internal static Bitmap DetachedRgba(Bitmap source)
        {
            var image = new Bitmap(source.Width, source.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            var rectangle = new Rectangle(Point.Empty, source.Size);
            try
            {
                var input = source.LockBits(rectangle, System.Drawing.Imaging.ImageLockMode.ReadOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                try
                {
                    var output = image.LockBits(rectangle, System.Drawing.Imaging.ImageLockMode.WriteOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                    try
                    {
                        byte[] row = new byte[source.Width * 4];
                        for (int y = 0; y < source.Height; y++)
                        {
                            System.Runtime.InteropServices.Marshal.Copy(IntPtr.Add(input.Scan0, y * input.Stride), row, 0, row.Length);
                            System.Runtime.InteropServices.Marshal.Copy(row, 0, IntPtr.Add(output.Scan0, y * output.Stride), row.Length);
                        }
                    }
                    finally { image.UnlockBits(output); }
                }
                finally { source.UnlockBits(input); }
                return image;
            }
            catch { image.Dispose(); throw; }
        }
        internal static void ValidatePng(byte[] bytes, int width, int height, string sha256)
        {
            byte[] signature = { 137, 80, 78, 71, 13, 10, 26, 10 };
            if (bytes == null || bytes.Length < 33 || bytes.Length > MaxFileBytes) throw new InvalidDataException("강아지 이미지 파일 크기를 확인하지 못했어요.");
            for (int i = 0; i < signature.Length; i++) if (bytes[i] != signature[i]) throw new InvalidDataException("강아지 이미지는 PNG 파일이어야 해요.");
            if (BigEndian(bytes, 8) != 13 || bytes[12] != 73 || bytes[13] != 72 || bytes[14] != 68 || bytes[15] != 82
                || BigEndian(bytes, 16) != width || BigEndian(bytes, 20) != height
                || !String.Equals(Hash(bytes), sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("강아지 이미지가 원본과 일치하지 않아요. 다시 불러올게요.");
        }
        private async Task<byte[]> ReadImage(string url, string sha256, int width, int height, string origin, CancellationToken cancel)
        {
            string file = directory == null ? null : Path.Combine(directory, sha256.ToLowerInvariant() + ".png");
            if (file != null && File.Exists(file))
            {
                try
                {
                    if (new FileInfo(file).Length <= MaxFileBytes) { byte[] cached = File.ReadAllBytes(file); ValidatePng(cached, width, height, sha256); return cached; }
                }
                catch (IOException) { }
                catch (InvalidDataException) { }
            }
            using (var response = await http.GetAsync(ValidateAssetUrl(url, origin), HttpCompletionOption.ResponseHeadersRead, cancel))
            {
                if (!response.IsSuccessStatusCode) throw new IOException("강아지 이미지를 받을 수 없어요. 잠시 후 다시 확인해 주세요.");
                if (response.Content.Headers.ContentLength > MaxFileBytes) throw new InvalidDataException("강아지 이미지 파일이 너무 커요.");
                using (Stream input = await response.Content.ReadAsStreamAsync())
                using (var output = new MemoryStream())
                {
                    byte[] buffer = new byte[32768]; int count;
                    while ((count = await input.ReadAsync(buffer, 0, buffer.Length, cancel)) > 0)
                    {
                        if (output.Length + count > MaxFileBytes) throw new InvalidDataException("강아지 이미지 파일이 너무 커요.");
                        output.Write(buffer, 0, count);
                    }
                    byte[] bytes = output.ToArray(); ValidatePng(bytes, width, height, sha256);
                    cancel.ThrowIfCancellationRequested();
                    if (directory == null) return bytes;
                    Directory.CreateDirectory(directory);
                    string temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
                    try
                    {
                        File.WriteAllBytes(temporary, bytes);
                        if (File.Exists(file)) File.Replace(temporary, file, null); else File.Move(temporary, file);
                    }
                    finally { if (File.Exists(temporary)) File.Delete(temporary); }
                    return bytes;
                }
            }
        }
        internal async Task UpdateAsync(DesktopAppearance descriptor, string siteOrigin)
        {
            if (disposed) return;
            if (descriptor == null)
            {
                generation++;
                if (pending != null) pending.Cancel(); pending = null; pendingKey = null;
                DesktopAppearanceFrames previous = Current; Current = null; Status = ""; failedKey = null;
                Announce(); if (previous != null) previous.Dispose(); return;
            }
            try { Validate(descriptor, siteOrigin); }
            catch (Exception error)
            {
                if (!(error is ArgumentException || error is InvalidDataException)) throw;
                generation++; if (pending != null) pending.Cancel(); pending = null; pendingKey = null;
                Status = error.Message; Announce(); return;
            }
            string effectiveKey = descriptor.EffectiveKey;
            if (Current != null && Current.Key == effectiveKey)
            {
                if (pendingKey != null && pendingKey != effectiveKey) { generation++; if (pending != null) pending.Cancel(); pending = null; pendingKey = null; }
                Status = "웹 스타일 적용됨 · " + descriptor.styleName; return;
            }
            if (pendingKey == effectiveKey || (failedKey == effectiveKey && DateTime.UtcNow < retryAt)) return;
            generation++; int stamp = generation;
            if (pending != null) pending.Cancel();
            var request = new CancellationTokenSource(); pending = request; pendingKey = effectiveKey;
            Status = "웹에서 선택한 강아지 그림을 불러오고 있어요…"; Announce();
            var sheets = new Dictionary<string, Bitmap>(StringComparer.Ordinal);
            try
            {
                foreach (string name in Scenes)
                {
                    DesktopAppearanceScene scene = descriptor.scenes[name];
                    if (scene.HasLayeredFields)
                    {
                        byte[] bodyBytes = await ReadImage(scene.bodyUrl, scene.bodySha256, descriptor.width * scene.bodyFrames, descriptor.height, siteOrigin, request.Token);
                        byte[] eyeBytes = await ReadImage(scene.eyeUrl, scene.eyeSha256, 32, 16, siteOrigin, request.Token);
                        request.Token.ThrowIfCancellationRequested();
                        using (var bodyStream = new MemoryStream(bodyBytes))
                        using (var eyeStream = new MemoryStream(eyeBytes))
                        using (var body = new Bitmap(bodyStream))
                        using (var eye = new Bitmap(eyeStream))
                            sheets.Add(name, DesktopAppearanceFrames.ComposeEyes(body, eye, descriptor.width, descriptor.height, scene.bodyFrames, scene.eyeAnchors, descriptor.accessory));
                    }
                    else
                    {
                        byte[] bytes = await ReadImage(scene.url, scene.sha256, descriptor.width * scene.frames, descriptor.height, siteOrigin, request.Token);
                        request.Token.ThrowIfCancellationRequested();
                        using (var stream = new MemoryStream(bytes))
                        using (var bitmap = new Bitmap(stream)) sheets.Add(name, DetachedRgba(bitmap));
                    }
                }
                if (disposed || stamp != generation) return;
                var next = new DesktopAppearanceFrames(descriptor, sheets); sheets.Clear();
                DesktopAppearanceFrames previous = Current; Current = next; failedKey = null;
                Status = "웹 스타일 적용됨 · " + descriptor.styleName; pendingKey = null;
                Announce(); if (previous != null) previous.Dispose();
            }
            catch (Exception error)
            {
                if (!(error is HttpRequestException || error is IOException || error is InvalidDataException || error is UnauthorizedAccessException || error is OperationCanceledException || error is ArgumentException || error is System.Runtime.InteropServices.ExternalException)) throw;
                if (!disposed && stamp == generation)
                {
                    failedKey = effectiveKey; retryAt = DateTime.UtcNow.AddSeconds(20);
                    Status = "강아지 그림을 불러오지 못했어요. 연결을 확인하면 다시 시도해요." + (Current != null ? " 마지막 모습을 유지하고 있어요." : " PC 앱은 연결되어 있어요.");
                }
            }
            finally
            {
                foreach (Bitmap sheet in sheets.Values) sheet.Dispose();
                request.Dispose();
                if (stamp == generation) { pending = null; pendingKey = null; Announce(); }
            }
        }
        public void Dispose()
        {
            if (disposed) return; disposed = true; generation++;
            if (pending != null) pending.Cancel();
            http.Dispose();
            if (Current != null) Current.Dispose(); Current = null;
        }
    }
}
