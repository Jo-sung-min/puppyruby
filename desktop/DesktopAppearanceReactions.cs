using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class DesktopReactionPoint
    {
        public int x { get; set; } public int y { get; set; }
        public int rx { get; set; } public int ry { get; set; }
    }

    internal sealed class DesktopReactionAnchors
    {
        public int width { get; set; } public int height { get; set; }
        public DesktopReactionPoint[] eyes { get; set; }
        public DesktopReactionPoint[] paws { get; set; }
        public int footY { get; set; }
    }

    // Reactions are composed at the source image's native resolution. Only the
    // inspected pupil regions and foreground props change; fur is never reduced
    // to a smaller palette, recolored, or regenerated.
    internal sealed class DesktopAppearanceReactions : IDisposable
    {
        internal const int MaxReactionFrames = 24;
        internal const long MaxReactionPixels = 16L * 1024 * 1024;
        private static readonly Dictionary<string, DesktopReactionAnchors> AnchorCatalog = LoadAnchors();
        private readonly Dictionary<string, DesktopAppearanceFrame> cache = new Dictionary<string, DesktopAppearanceFrame>(StringComparer.Ordinal);
        private readonly LinkedList<string> order = new LinkedList<string>();
        private readonly DesktopReactionAnchors anchors;
        private long pixels;
        private Bitmap rotationSource;
        private int[] rotationPixels;
        private Rectangle rotationBounds;
        internal int CachedFrameCount { get { return cache.Count; } }
        internal long CachedPixelCount { get { return pixels; } }

        internal DesktopAppearanceReactions(DesktopAppearanceFrames owner)
        {
            DesktopReactionAnchors found;
            if (owner.ReactionAnchors != null && ValidAnchors(owner.ReactionAnchors, owner.Width, owner.Height)) anchors = owner.ReactionAnchors;
            else if (owner.StyleId == "art-16-scenes" && AnchorCatalog.TryGetValue(owner.BreedId ?? "", out found) && ValidAnchors(found, owner.Width, owner.Height)) anchors = found;
        }

        internal DesktopAppearanceReactions() { }

        private static Dictionary<string, DesktopReactionAnchors> LoadAnchors()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("art16-reaction-anchors.json"))
            {
                if (stream == null) return new Dictionary<string, DesktopReactionAnchors>(StringComparer.Ordinal);
                using (var reader = new StreamReader(stream))
                    return new JavaScriptSerializer().Deserialize<Dictionary<string, DesktopReactionAnchors>>(reader.ReadToEnd());
            }
        }

        private static bool ValidAnchors(DesktopReactionAnchors value, int width, int height)
        {
            if (value == null || value.width != width || value.height != height || value.eyes == null || value.eyes.Length != 2 || value.paws == null || value.paws.Length != 2 || value.footY < 1 || value.footY > height) return false;
            foreach (DesktopReactionPoint p in value.eyes)
                if (p == null || p.rx < 2 || p.ry < 2 || p.x - p.rx < 0 || p.x + p.rx >= width || p.y - p.ry < 0 || p.y + p.ry >= height) return false;
            foreach (DesktopReactionPoint p in value.paws)
                if (p == null || p.rx < 2 || p.ry < 2 || p.x - p.rx < 0 || p.x + p.rx >= width || p.y - p.ry < 0 || p.y + p.ry >= height) return false;
            return true;
        }

        internal DesktopAppearanceFrame Get(DesktopAppearanceFrame original, string scene, string mood, double elapsed, int gazeX, int gazeY)
        {
            if (Double.IsNaN(elapsed) || Double.IsInfinity(elapsed)) elapsed = 0;
            elapsed = Math.Max(0, elapsed);
            if (scene == "idle" && mood == "belly") return GetBellyFrame(original.Image, elapsed);
            gazeX = Math.Max(-1, Math.Min(1, gazeX)); gazeY = Math.Max(-1, Math.Min(1, gazeY));
            bool typing = scene == "idle" && (mood == "typing" || mood == "excited");
            bool love = scene == "happy" && mood == "love";
            bool eating = scene == "idle" && mood == "eat";
            bool looking = scene == "idle" && anchors != null && (gazeX != 0 || gazeY != 0) && !typing && !eating;
            if (!typing && !love && !eating && !looking) return original;
            int phase = (int)(elapsed * (mood == "excited" ? 13 : 7) % 2);
            string key = typing ? "typing:" + phase : love ? "love:" + phase : eating ? "eat:" + phase : "gaze:" + gazeX + ":" + gazeY;
            DesktopAppearanceFrame existing;
            if (cache.TryGetValue(key, out existing))
            {
                order.Remove(key); order.AddLast(key); return existing;
            }

            Bitmap bitmap = DesktopAppearanceCache.DetachedRgba(original.Image);
            try
            {
                if (looking) MovePupils(original.Image, bitmap, gazeX, gazeY);
                if (typing) DrawKeyboard(original.Image, bitmap, phase);
                if (love) DrawHearts(bitmap, phase);
                if (eating) DrawFood(bitmap, phase);
                var frame = new DesktopAppearanceFrame(bitmap);
                bitmap = null;
                long size = (long)frame.Image.Width * frame.Image.Height;
                while (cache.Count > 0 && (cache.Count >= MaxReactionFrames || pixels + size > MaxReactionPixels))
                {
                    string oldest = order.First.Value; order.RemoveFirst();
                    DesktopAppearanceFrame previous = cache[oldest]; cache.Remove(oldest);
                    pixels -= (long)previous.Image.Width * previous.Image.Height;
                    previous.Dispose();
                }
                cache.Add(key, frame); order.AddLast(key); pixels += size;
                return frame;
            }
            finally { if (bitmap != null) bitmap.Dispose(); }
        }

        // Roll onto the back once, hold the tummy-up pose with a tiny wiggle,
        // then roll back. Quantized angles keep native pixel colors and put a
        // strict bound on generated frames rather than spinning indefinitely.
        internal static int BellyAngle(double elapsed)
        {
            if (Double.IsNaN(elapsed) || Double.IsInfinity(elapsed) || elapsed <= 0 || elapsed >= PetState.BellyDurationSeconds) return 0;
            const double transition = .35;
            double progress;
            if (elapsed < transition) progress = elapsed / transition;
            else if (elapsed > PetState.BellyDurationSeconds - transition) progress = (PetState.BellyDurationSeconds - elapsed) / transition;
            else
            {
                int phase = (int)((elapsed - transition) * 5) % 4;
                return phase == 1 ? 174 : phase == 3 ? 186 : 180;
            }
            double ease = progress * progress * (3 - 2 * progress);
            return (int)Math.Round(ease * 6) * 30;
        }

        internal DesktopAppearanceFrame GetBellyFrame(Bitmap source, double elapsed)
        {
            if (source == null) throw new ArgumentNullException("source");
            if (rotationSource != source)
            {
                var obsolete = new List<string>();
                foreach (string entry in cache.Keys) if (entry.StartsWith("belly:", StringComparison.Ordinal)) obsolete.Add(entry);
                foreach (string entry in obsolete)
                {
                    DesktopAppearanceFrame previous = cache[entry]; cache.Remove(entry); order.Remove(entry);
                    pixels -= (long)previous.Image.Width * previous.Image.Height; previous.Dispose();
                }
                rotationSource = source; rotationPixels = ReadPixels(source);
                rotationBounds = OpaqueBounds(rotationPixels, source.Width, source.Height);
            }
            int angle = BellyAngle(elapsed);
            string key = "belly:" + angle;
            DesktopAppearanceFrame existing;
            if (cache.TryGetValue(key, out existing)) { order.Remove(key); order.AddLast(key); return existing; }
            Bitmap bitmap = angle == 0 ? DesktopAppearanceCache.DetachedRgba(source) : RotateOriginal(source.Width, source.Height, angle);
            DesktopAppearanceFrame frame;
            try { frame = new DesktopAppearanceFrame(bitmap); }
            catch { bitmap.Dispose(); throw; }
            long size = (long)source.Width * source.Height;
            while (cache.Count > 0 && (cache.Count >= MaxReactionFrames || pixels + size > MaxReactionPixels))
            {
                string oldest = order.First.Value; order.RemoveFirst();
                DesktopAppearanceFrame previous = cache[oldest]; cache.Remove(oldest);
                pixels -= (long)previous.Image.Width * previous.Image.Height; previous.Dispose();
            }
            cache.Add(key, frame); order.AddLast(key); pixels += size;
            return frame;
        }

        private Bitmap RotateOriginal(int width, int height, int angle)
        {
            double radians = angle * Math.PI / 180, cosine = Math.Cos(radians), sine = Math.Sin(radians);
            double centerX = rotationBounds.Left + (rotationBounds.Width - 1) / 2.0;
            double centerY = rotationBounds.Top + (rotationBounds.Height - 1) / 2.0;
            double radiusX = (rotationBounds.Width - 1) / 2.0, radiusY = (rotationBounds.Height - 1) / 2.0;
            double extentX = Math.Abs(cosine) * radiusX + Math.Abs(sine) * radiusY;
            double extentY = Math.Abs(sine) * radiusX + Math.Abs(cosine) * radiusY;
            double scale = Math.Min(1, Math.Min(Math.Min(centerX, width - 1 - centerX) / Math.Max(1, extentX), Math.Min(centerY, height - 1 - centerY) / Math.Max(1, extentY)));
            scale = Math.Max(.05, scale);
            var output = new int[width * height];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
            {
                double dx = (x - centerX) / scale, dy = (y - centerY) / scale;
                int sourceX = (int)Math.Round(centerX + cosine * dx + sine * dy);
                int sourceY = (int)Math.Round(centerY - sine * dx + cosine * dy);
                if (sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height) output[y * width + x] = rotationPixels[sourceY * width + sourceX];
            }
            var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            BitmapData data = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            try { for (int y = 0; y < height; y++) Marshal.Copy(output, y * width, IntPtr.Add(data.Scan0, y * data.Stride), width); }
            finally { bitmap.UnlockBits(data); }
            return bitmap;
        }

        private static int[] ReadPixels(Bitmap source)
        {
            var result = new int[source.Width * source.Height];
            BitmapData data = source.LockBits(new Rectangle(Point.Empty, source.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try { for (int y = 0; y < source.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), result, y * source.Width, source.Width); }
            finally { source.UnlockBits(data); }
            return result;
        }

        private static Rectangle OpaqueBounds(int[] data, int width, int height)
        {
            int left = width, top = height, right = -1, bottom = -1;
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
            {
                if ((data[y * width + x] & unchecked((int)0xff000000)) == 0) continue;
                left = Math.Min(left, x); top = Math.Min(top, y); right = Math.Max(right, x); bottom = Math.Max(bottom, y);
            }
            return right < left ? new Rectangle(0, 0, width, height) : new Rectangle(left, top, right - left + 1, bottom - top + 1);
        }

        private void MovePupils(Bitmap source, Bitmap target, int gazeX, int gazeY)
        {
            foreach (DesktopReactionPoint eye in anchors.eyes)
            {
                int dx = gazeX * Math.Max(1, Math.Min(3, (int)Math.Round(eye.rx * .25)));
                int dy = gazeY * Math.Max(1, Math.Min(3, (int)Math.Round(eye.ry * .22)));
                int left = eye.x - eye.rx, top = eye.y - eye.ry;
                int width = eye.rx * 2 + 1, height = eye.ry * 2 + 1;
                bool[,] pupil = new bool[width, height];
                // Capture the original dark pupil plus enclosed catchlights. A
                // stationary iris/eyelid ring gives the movement a natural edge.
                for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
                {
                    double nx = (left + x - eye.x) / (eye.rx * .76), ny = (top + y - eye.y) / (eye.ry * .78);
                    Color color = source.GetPixel(left + x, top + y);
                    if (nx * nx + ny * ny <= 1 && color.A > 180 && Luma(color) < 112) pupil[x, y] = true;
                }
                for (int y = 1; y < height - 1; y++) for (int x = 1; x < width - 1; x++)
                {
                    if (pupil[x, y]) continue;
                    double nx = (left + x - eye.x) / (eye.rx * .70), ny = (top + y - eye.y) / (eye.ry * .72);
                    if (nx * nx + ny * ny > 1) continue;
                    Color color = source.GetPixel(left + x, top + y);
                    if (color.A < 180 || Luma(color) < 145) continue;
                    int dark = 0;
                    for (int yy = Math.Max(0, y - 3); yy <= Math.Min(height - 1, y + 3); yy++)
                        for (int xx = Math.Max(0, x - 3); xx <= Math.Min(width - 1, x + 3); xx++) if (pupil[xx, yy]) dark++;
                    if (dark >= 9) pupil[x, y] = true;
                }
                for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
                    if (pupil[x, y]) target.SetPixel(left + x, top + y, IrisColor(source, eye, left + x, top + y, pupil, left, top));
                for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
                {
                    if (!pupil[x, y]) continue;
                    int destinationX = left + x + dx, destinationY = top + y + dy;
                    double nx = (destinationX - eye.x) / (double)eye.rx, ny = (destinationY - eye.y) / (double)eye.ry;
                    if (nx * nx + ny * ny <= 1) target.SetPixel(destinationX, destinationY, source.GetPixel(left + x, top + y));
                }
            }
        }

        private static int Luma(Color color) { return (color.R * 3 + color.G * 6 + color.B) / 10; }

        private static Color IrisColor(Bitmap source, DesktopReactionPoint eye, int x, int y, bool[,] pupil, int left, int top)
        {
            Color fallback = source.GetPixel(x, y); int best = Int32.MaxValue;
            for (int yy = eye.y - eye.ry; yy <= eye.y + eye.ry; yy++)
                for (int xx = eye.x - eye.rx; xx <= eye.x + eye.rx; xx++)
                {
                    double nx = (xx - eye.x) / (double)eye.rx, ny = (yy - eye.y) / (double)eye.ry;
                    if (nx * nx + ny * ny > .94 || pupil[xx - left, yy - top]) continue;
                    Color color = source.GetPixel(xx, yy); int luminance = Luma(color);
                    if (color.A < 220 || luminance < 45 || luminance > 195) continue;
                    int distance = (xx - x) * (xx - x) + (yy - y) * (yy - y);
                    if (distance < best) { best = distance; fallback = color; }
                }
            return fallback;
        }

        private void DrawKeyboard(Bitmap original, Bitmap target, int phase)
        {
            int unit = Math.Max(1, (int)Math.Round(target.Width / 180.0));
            int foot = anchors == null ? (int)(target.Height * .91) : anchors.footY;
            int center = anchors == null ? target.Width / 2 : (anchors.paws[0].x + anchors.paws[1].x) / 2;
            int width = Math.Max(unit * 48, (int)(target.Width * .54));
            int height = Math.Max(unit * 16, (int)(target.Height * .105));
            int left = Math.Max(unit * 2, Math.Min(target.Width - width - unit * 2, center - width / 2));
            int top = Math.Max(1, Math.Min(target.Height - height - unit * 2, foot - height + unit));
            using (Graphics graphics = Graphics.FromImage(target))
            {
                graphics.SmoothingMode = SmoothingMode.None; graphics.InterpolationMode = InterpolationMode.NearestNeighbor; graphics.PixelOffsetMode = PixelOffsetMode.Half;
                Fill(graphics, "#3e3941", left, top + unit, width, height);
                Fill(graphics, "#6c6670", left + unit, top, width - unit * 2, height - unit);
                Fill(graphics, "#d5d0cf", left + unit * 2, top + unit * 2, width - unit * 4, height - unit * 5);
                int keyW = (width - unit * 10) / 10, keyH = Math.Max(2, (height - unit * 9) / 3);
                for (int row = 0; row < 3; row++) for (int col = 0; col < 10; col++)
                {
                    int keyX = left + unit * 3 + col * (keyW + unit / 2), keyY = top + unit * 3 + row * (keyH + unit);
                    bool pressed = row == 1 && col == (phase == 0 ? 3 : 6);
                    Fill(graphics, pressed ? "#b3a3cf" : "#f6f2eb", keyX, keyY + (pressed ? unit : 0), keyW - unit, keyH);
                }
                Fill(graphics, "#eee9e3", center - width / 6, top + height - unit * 5, width / 3, unit * 2);
                Fill(graphics, phase == 0 ? "#d4beeb" : "#93b6ad", left + width - unit * 6, top + unit, unit * 2, unit);
                if (anchors != null)
                {
                    for (int index = 0; index < anchors.paws.Length; index++)
                    {
                        DesktopReactionPoint paw = anchors.paws[index];
                        int dy = top + unit * 3 - paw.y - (index == phase ? 0 : unit * 3);
                        using (Bitmap cutout = PawCutout(original, paw))
                            graphics.DrawImage(cutout, new Rectangle(paw.x - paw.rx, paw.y - paw.ry + dy, cutout.Width, cutout.Height), 0, 0, cutout.Width, cutout.Height, GraphicsUnit.Pixel);
                    }
                }
            }
        }

        private static Bitmap PawCutout(Bitmap original, DesktopReactionPoint paw)
        {
            var bitmap = new Bitmap(paw.rx * 2 + 1, paw.ry * 2 + 1, PixelFormat.Format32bppArgb);
            for (int y = 0; y < bitmap.Height; y++) for (int x = 0; x < bitmap.Width; x++)
            {
                double nx = (x - paw.rx) / (double)paw.rx, ny = (y - paw.ry) / (double)paw.ry;
                if (nx * nx + ny * ny <= 1) bitmap.SetPixel(x, y, original.GetPixel(paw.x - paw.rx + x, paw.y - paw.ry + y));
            }
            return bitmap;
        }

        private static void Fill(Graphics graphics, string color, int x, int y, int width, int height)
        {
            if (width < 1 || height < 1) return;
            using (var brush = new SolidBrush(ColorTranslator.FromHtml(color))) graphics.FillRectangle(brush, x, y, width, height);
        }

        private static void DrawHearts(Bitmap target, int phase)
        {
            int unit = Math.Max(2, target.Width / 100);
            using (Graphics graphics = Graphics.FromImage(target))
            {
                Heart(graphics, target.Width / 7, target.Height / 4 - phase * unit * 3, unit, "#d88696");
                Heart(graphics, target.Width * 4 / 5, target.Height / 6 + phase * unit * 2, unit, "#efa3ac");
            }
        }

        private static void Heart(Graphics graphics, int x, int y, int unit, string color)
        {
            Fill(graphics, color, x + unit, y, unit * 2, unit);
            Fill(graphics, color, x + unit * 4, y, unit * 2, unit);
            Fill(graphics, color, x, y + unit, unit * 7, unit * 2);
            Fill(graphics, color, x + unit, y + unit * 3, unit * 5, unit);
            Fill(graphics, color, x + unit * 2, y + unit * 4, unit * 3, unit);
            Fill(graphics, color, x + unit * 3, y + unit * 5, unit, unit);
        }

        private void DrawFood(Bitmap target, int phase)
        {
            int unit = Math.Max(2, target.Width / 100), center = target.Width / 2;
            int y = Math.Min(target.Height - unit * 4, anchors == null ? target.Height * 9 / 10 : anchors.footY - unit * 3);
            using (Graphics graphics = Graphics.FromImage(target))
            {
                Fill(graphics, "#664e3d", center - unit * 9, y - unit, unit * 18, unit * 3);
                Fill(graphics, "#d6a486", center - unit * 10, y + unit, unit * 20, unit * 3);
                Fill(graphics, "#a77467", center - unit * 8, y + unit * 4, unit * 16, unit * 2);
                Fill(graphics, "#ecc39b", center - unit * (phase == 0 ? 5 : 1), y - unit, unit * 3, unit);
            }
        }

        public void Dispose()
        {
            foreach (DesktopAppearanceFrame frame in cache.Values) frame.Dispose();
            cache.Clear(); order.Clear(); pixels = 0;
            rotationSource = null; rotationPixels = null;
        }
    }
}
