using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace PuppyRubyDesktop
{
    internal sealed class DesktopAppearanceFrame : IDisposable
    {
        internal readonly Bitmap Image;
        internal readonly bool[] Opaque;

        internal DesktopAppearanceFrame(Bitmap image)
        {
            Image = image;
            Opaque = new bool[image.Width * image.Height];
            BitmapData data = image.LockBits(new Rectangle(Point.Empty, image.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                byte[] row = new byte[image.Width * 4];
                for (int y = 0; y < image.Height; y++)
                {
                    Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
                    for (int x = 0; x < image.Width; x++) Opaque[y * image.Width + x] = row[x * 4 + 3] > 0;
                }
            }
            finally { image.UnlockBits(data); }
        }

        public void Dispose() { Image.Dispose(); }
    }

    // A complete, validated appearance is prepared before the paint loop sees it.
    // The supplied sheets transfer ownership to this object, including on failure.
    internal sealed class DesktopAppearanceFrames : IDisposable
    {
        private sealed class Scene
        {
            internal DesktopAppearanceFrame[] Normal;
            internal DesktopAppearanceFrame[] Flipped;
            internal int FrameMs;
        }

        private readonly Dictionary<string, Scene> scenes = new Dictionary<string, Scene>(StringComparer.Ordinal);
        private readonly List<DesktopAppearanceFrame> owned = new List<DesktopAppearanceFrame>();
        private DesktopAppearanceReactions reactions;
        internal readonly string Key;
        internal readonly string StyleId;
        internal readonly string BreedId;
        internal readonly int Width;
        internal readonly int Height;
        internal int CachedFrameCount { get { return owned.Count; } }
        internal int ReactionFrameCount { get { return reactions == null ? 0 : reactions.CachedFrameCount; } }
        internal long ReactionPixelCount { get { return reactions == null ? 0 : reactions.CachedPixelCount; } }

        internal DesktopAppearanceFrames(DesktopAppearance descriptor, Dictionary<string, Bitmap> sheets)
        {
            try
            {
                if (descriptor == null || sheets == null || descriptor.scenes == null || descriptor.width < 1 || descriptor.height < 1 || descriptor.width > 2048 || descriptor.height > 2048)
                    throw new InvalidDataException("강아지 이미지 크기를 읽지 못했어요.");
                Key = descriptor.EffectiveKey; StyleId = descriptor.styleId; BreedId = descriptor.breedId;
                Width = descriptor.width; Height = descriptor.height;
                var unique = new Dictionary<string, Scene>(StringComparer.Ordinal);
                foreach (string name in new[] { "idle", "side", "walk", "happy", "sleep" })
                {
                    DesktopAppearanceScene spec; Bitmap sheet;
                    if (!descriptor.scenes.TryGetValue(name, out spec) || spec == null || !sheets.TryGetValue(name, out sheet) || sheet == null)
                        throw new InvalidDataException("강아지 장면의 프레임 크기가 맞지 않아요.");
                    int count = spec.EffectiveFrames;
                    if (count < 1 || count > 8 || spec.frameMs < 16 || spec.frameMs > 10000 || sheet.Width != Width * count || sheet.Height != Height)
                        throw new InvalidDataException("강아지 장면의 프레임 크기가 맞지 않아요.");
                    string fingerprint = spec.HasLayeredFields ? descriptor.EffectiveKey + ":" + name
                        : String.IsNullOrEmpty(spec.sha256) ? name : spec.sha256 + ":" + count;
                    Scene scene;
                    if (!unique.TryGetValue(fingerprint, out scene))
                    {
                        scene = new Scene { Normal = new DesktopAppearanceFrame[count], Flipped = new DesktopAppearanceFrame[count], FrameMs = spec.frameMs };
                        for (int i = 0; i < count; i++)
                        {
                            var frame = new DesktopAppearanceFrame(sheet.Clone(new Rectangle(i * Width, 0, Width, Height), PixelFormat.Format32bppArgb));
                            owned.Add(frame); scene.Normal[i] = frame;
                            Bitmap mirror = (Bitmap)frame.Image.Clone();
                            mirror.RotateFlip(RotateFlipType.RotateNoneFlipX);
                            var flipped = new DesktopAppearanceFrame(mirror);
                            owned.Add(flipped); scene.Flipped[i] = flipped;
                        }
                        unique.Add(fingerprint, scene);
                    }
                    scenes.Add(name, new Scene { Normal = scene.Normal, Flipped = scene.Flipped, FrameMs = spec.frameMs });
                }
            }
            catch { Dispose(); throw; }
            finally
            {
                if (sheets != null)
                {
                    var released = new HashSet<Bitmap>();
                    foreach (Bitmap sheet in sheets.Values) if (sheet != null && released.Add(sheet)) sheet.Dispose();
                }
            }
        }

        // The web renderer treats the 32 x 16 source as two independent 16 x 16
        // eye tiles. Compose them onto the eyeless native sheet before slicing,
        // preserving pixel edges and straight-alpha source-over blending.
        internal static Bitmap ComposeEyes(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors)
        {
            if (bodySheet == null) throw new ArgumentNullException("bodySheet");
            if (eyePair == null) throw new ArgumentNullException("eyePair");
            if (frameWidth < 1 || frameHeight < 1 || frames < 1 || frames > 8
                || bodySheet.Width != frameWidth * frames || bodySheet.Height != frameHeight
                || eyePair.Width != 32 || eyePair.Height != 16 || anchors == null || anchors.Length != frames)
                throw new InvalidDataException("강아지 눈 레이어 크기를 확인하지 못했어요.");
            foreach (DesktopEyeAnchor[] frame in anchors)
            {
                if (frame == null || frame.Length < 1 || frame.Length > 2) throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
                foreach (DesktopEyeAnchor eye in frame)
                    if (eye == null || eye.x < 0 || eye.y < 0 || eye.width < 1 || eye.height < 1
                        || eye.x + eye.width > frameWidth || eye.y + eye.height > frameHeight)
                        throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
            }

            Bitmap output = DesktopAppearanceCache.DetachedRgba(bodySheet);
            try
            {
                int sheetWidth = output.Width;
                int[] pixels = ReadArgb(output);
                int[] eyes = ReadArgb(eyePair);
                for (int frame = 0; frame < frames; frame++)
                {
                    DesktopEyeAnchor[] eyeAnchors = anchors[frame];
                    for (int side = 0; side < eyeAnchors.Length; side++)
                    {
                        DesktopEyeAnchor anchor = eyeAnchors[side];
                        for (int y = 0; y < anchor.height; y++)
                        for (int x = 0; x < anchor.width; x++)
                        {
                            int sourceX = side * 16 + Math.Min(15, x * 16 / anchor.width);
                            int sourceY = Math.Min(15, y * 16 / anchor.height);
                            int source = eyes[sourceY * 32 + sourceX];
                            if (((uint)source >> 24) == 0) continue;
                            int target = (frame * frameWidth + anchor.x + x) + (anchor.y + y) * sheetWidth;
                            pixels[target] = SourceOver(source, pixels[target]);
                        }
                    }
                }
                WriteArgb(output, pixels);
                return output;
            }
            catch { output.Dispose(); throw; }
        }

        private static int[] ReadArgb(Bitmap bitmap)
        {
            Bitmap converted = null;
            Bitmap source = bitmap;
            if (bitmap.PixelFormat != PixelFormat.Format32bppArgb) { converted = DesktopAppearanceCache.DetachedRgba(bitmap); source = converted; }
            try
            {
                int[] result = new int[source.Width * source.Height];
                BitmapData data = source.LockBits(new Rectangle(Point.Empty, source.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                try { for (int y = 0; y < source.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), result, y * source.Width, source.Width); }
                finally { source.UnlockBits(data); }
                return result;
            }
            finally { if (converted != null) converted.Dispose(); }
        }

        private static void WriteArgb(Bitmap bitmap, int[] pixels)
        {
            BitmapData data = bitmap.LockBits(new Rectangle(Point.Empty, bitmap.Size), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            try { for (int y = 0; y < bitmap.Height; y++) Marshal.Copy(pixels, y * bitmap.Width, IntPtr.Add(data.Scan0, y * data.Stride), bitmap.Width); }
            finally { bitmap.UnlockBits(data); }
        }

        private static int SourceOver(int source, int destination)
        {
            int sourceAlpha = (int)((uint)source >> 24);
            if (sourceAlpha == 255) return source;
            int destinationAlpha = (int)((uint)destination >> 24);
            int inverse = 255 - sourceAlpha;
            int outputAlpha = sourceAlpha + (destinationAlpha * inverse + 127) / 255;
            if (outputAlpha == 0) return 0;
            int red = BlendChannel((source >> 16) & 255, sourceAlpha, (destination >> 16) & 255, destinationAlpha, inverse, outputAlpha);
            int green = BlendChannel((source >> 8) & 255, sourceAlpha, (destination >> 8) & 255, destinationAlpha, inverse, outputAlpha);
            int blue = BlendChannel(source & 255, sourceAlpha, destination & 255, destinationAlpha, inverse, outputAlpha);
            return (outputAlpha << 24) | (red << 16) | (green << 8) | blue;
        }

        private static int BlendChannel(int source, int sourceAlpha, int destination, int destinationAlpha, int inverse, int outputAlpha)
        {
            long denominator = (long)outputAlpha * 255;
            long numerator = (long)source * sourceAlpha * 255 + (long)destination * destinationAlpha * inverse;
            return (int)((numerator + denominator / 2) / denominator);
        }

        internal DesktopAppearanceFrame Get(string name, int frame, bool flip)
        {
            Scene scene;
            if (!scenes.TryGetValue(name ?? "idle", out scene)) scene = scenes["idle"];
            int index = Math.Max(0, frame) % scene.Normal.Length;
            return flip ? scene.Flipped[index] : scene.Normal[index];
        }

        internal DesktopAppearanceFrame At(string name, double elapsedSeconds, bool paused, bool flip)
        {
            Scene scene;
            if (!scenes.TryGetValue(name ?? "idle", out scene)) name = "idle";
            scene = scenes[name];
            int frame = paused || Double.IsNaN(elapsedSeconds) || Double.IsInfinity(elapsedSeconds) ? 0 : (int)(Math.Max(0, elapsedSeconds) * 1000 / scene.FrameMs % scene.Normal.Length);
            return Get(name, frame, flip);
        }

        internal static string SelectScene(string mood, string training, bool moving, bool resting, bool enabled)
        {
            if (training == "puppy-bang" || resting) return "sleep";
            if (training == "puppy-sit" || training == "puppy-stay") return "idle";
            if (training == "puppy-turn") return "side";
            if (training == "puppy-paw") return "happy";
            if (!enabled) return "idle";
            // Input reactions own their pose while active, even when the cursor is
            // outside the follow distance. Typing must always face the keyboard.
            if (mood == "typing" || mood == "excited" || mood == "eat" || mood == "belly") return "idle";
            if (mood == "drag" || mood == "scroll") return "side";
            if (mood == "love" || mood == "play") return "happy";
            if (moving) return "walk";
            // Inactivity keeps the selected puppy facing forward and seated.
            return "idle";
        }

        internal DesktopAppearanceFrame React(string scene, string mood, string training, double elapsedSeconds, bool enabled, bool flip, int gazeX, int gazeY)
        {
            DesktopAppearanceFrame source = At(scene, elapsedSeconds, !enabled && training == null, flip);
            if (!enabled || training != null || scene == "walk" || scene == "sleep" || scene == "side") return source;
            if (reactions == null) reactions = new DesktopAppearanceReactions(this);
            return reactions.Get(source, scene, mood, elapsedSeconds, gazeX, gazeY);
        }

        internal static Size DisplaySize(int width, int height, int scale)
        {
            int edge = 96 * Math.Max(2, Math.Min(4, scale));
            double ratio = edge / (double)Math.Max(width, height);
            return new Size(Math.Max(1, (int)Math.Round(width * ratio)), Math.Max(1, (int)Math.Round(height * ratio)));
        }

        public void Dispose()
        {
            if (reactions != null) { reactions.Dispose(); reactions = null; }
            foreach (DesktopAppearanceFrame frame in owned) frame.Dispose();
            owned.Clear(); scenes.Clear();
        }
    }
}
