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
        // A front accessory is deliberately absent from this bitmap. Gaze uses
        // it to identify the real pupils instead of dark glasses or ornaments.
        internal readonly Bitmap ReactionSource;
        internal readonly bool[] ReactionProtected;
        internal readonly bool[] Opaque;

        internal DesktopAppearanceFrame(Bitmap image)
            : this(image, null)
        {
        }

        internal DesktopAppearanceFrame(Bitmap image, Bitmap reactionSource)
            : this(image, reactionSource, null)
        {
        }

        internal DesktopAppearanceFrame(Bitmap image, Bitmap reactionSource, bool[] reactionProtected)
        {
            if (image == null) throw new ArgumentNullException("image");
            if (reactionSource != null && reactionSource.Size != image.Size) throw new ArgumentException("Reaction source size must match the rendered frame.", "reactionSource");
            if (reactionProtected != null && reactionProtected.Length != image.Width * image.Height) throw new ArgumentException("Reaction protection mask size must match the rendered frame.", "reactionProtected");
            Image = image;
            ReactionSource = reactionSource;
            Opaque = new bool[image.Width * image.Height];
            ReactionProtected = reactionProtected ?? (reactionSource == null ? null : new bool[image.Width * image.Height]);
            BitmapData data = image.LockBits(new Rectangle(Point.Empty, image.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            BitmapData basis = null;
            try
            {
                if (reactionSource != null && reactionProtected == null) basis = reactionSource.LockBits(new Rectangle(Point.Empty, reactionSource.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                byte[] row = new byte[image.Width * 4], basisRow = basis == null ? null : new byte[image.Width * 4];
                for (int y = 0; y < image.Height; y++)
                {
                    Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
                    if (basis != null) Marshal.Copy(IntPtr.Add(basis.Scan0, y * basis.Stride), basisRow, 0, basisRow.Length);
                    for (int x = 0; x < image.Width; x++)
                    {
                        int pixel = x * 4, index = y * image.Width + x;
                        Opaque[index] = row[pixel + 3] > 0;
                        if (basisRow != null && reactionProtected == null) ReactionProtected[index] = row[pixel] != basisRow[pixel]
                            || row[pixel + 1] != basisRow[pixel + 1] || row[pixel + 2] != basisRow[pixel + 2]
                            || row[pixel + 3] != basisRow[pixel + 3];
                    }
                }
            }
            finally
            {
                if (basis != null) reactionSource.UnlockBits(basis);
                image.UnlockBits(data);
            }
        }

        public void Dispose() { Image.Dispose(); if (ReactionSource != null && ReactionSource != Image) ReactionSource.Dispose(); }
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
            internal DesktopEyeAnchor[][] Eyes;
            internal string[] EyeModes;
        }

        private readonly Dictionary<string, Scene> scenes = new Dictionary<string, Scene>(StringComparer.Ordinal);
        private readonly List<DesktopAppearanceFrame> owned = new List<DesktopAppearanceFrame>();
        private DesktopAppearanceReactions reactions;
        internal readonly string Key;
        internal readonly string StyleId;
        internal readonly string BreedId;
        internal readonly int Width;
        internal readonly int Height;
        internal readonly DesktopReactionAnchors ReactionAnchors;
        internal int CachedFrameCount { get { return owned.Count; } }
        internal int ReactionFrameCount { get { return reactions == null ? 0 : reactions.CachedFrameCount; } }
        internal long ReactionPixelCount { get { return reactions == null ? 0 : reactions.CachedPixelCount; } }
        internal bool HasNativeActions { get; private set; }

        internal DesktopAppearanceFrames(DesktopAppearance descriptor, Dictionary<string, Bitmap> sheets)
            : this(descriptor, sheets, null)
        {
        }

        internal DesktopAppearanceFrames(DesktopAppearance descriptor, Dictionary<string, Bitmap> sheets, string keyOverride)
            : this(descriptor, sheets, keyOverride, null)
        {
        }

        internal DesktopAppearanceFrames(DesktopAppearance descriptor, Dictionary<string, Bitmap> sheets, string keyOverride,
            Dictionary<string, Bitmap> reactionSheets)
            : this(descriptor, sheets, keyOverride, reactionSheets, null)
        {
        }

        internal DesktopAppearanceFrames(DesktopAppearance descriptor, Dictionary<string, Bitmap> sheets, string keyOverride,
            Dictionary<string, Bitmap> reactionSheets, Dictionary<string, Bitmap> reactionMasks)
        {
            try
            {
                if (descriptor == null || sheets == null || descriptor.scenes == null || descriptor.width < 1 || descriptor.height < 1 || descriptor.width > 2048 || descriptor.height > 2048)
                    throw new InvalidDataException("강아지 이미지 크기를 읽지 못했어요.");
                Key = String.IsNullOrEmpty(keyOverride) ? descriptor.EffectiveKey : keyOverride;
                StyleId = descriptor.styleId; BreedId = descriptor.breedId;
                Width = descriptor.width; Height = descriptor.height;
                HasNativeActions = descriptor.nativeActions != null;
                ReactionAnchors = BuildRubyReactionAnchors(descriptor);
                var unique = new Dictionary<string, Scene>(StringComparer.Ordinal);
                foreach (string name in DesktopAppearanceCache.SceneNames(descriptor))
                {
                    DesktopAppearanceScene spec = descriptor.Scene(name); Bitmap sheet; Bitmap reactionSheet = null; Bitmap reactionMask = null;
                    if (spec == null || !sheets.TryGetValue(name, out sheet) || sheet == null)
                        throw new InvalidDataException("강아지 장면의 프레임 크기가 맞지 않아요.");
                    int count = spec.EffectiveFrames;
                    if (count < 1 || count > 8 || spec.frameMs < 16 || spec.frameMs > 10000 || sheet.Width != Width * count || sheet.Height != Height)
                        throw new InvalidDataException("강아지 장면의 프레임 크기가 맞지 않아요.");
                    if (reactionSheets != null && reactionSheets.TryGetValue(name, out reactionSheet)
                        && (reactionSheet == null || reactionSheet.Size != sheet.Size))
                        throw new InvalidDataException("강아지 반응 기준 이미지의 크기가 맞지 않아요.");
                    if (reactionMasks != null && reactionMasks.TryGetValue(name, out reactionMask)
                        && (reactionMask == null || reactionMask.Size != sheet.Size || reactionSheet == null))
                        throw new InvalidDataException("강아지 반응 보호 마스크의 크기가 맞지 않아요.");
                    string fingerprint = spec.HasLayeredFields ? descriptor.EffectiveKey + ":" + name
                        : String.IsNullOrEmpty(spec.sha256) ? name : spec.sha256 + ":" + count;
                    Scene scene;
                    if (!unique.TryGetValue(fingerprint, out scene))
                    {
                        scene = new Scene { Normal = new DesktopAppearanceFrame[count], Flipped = new DesktopAppearanceFrame[count], FrameMs = spec.frameMs };
                        for (int i = 0; i < count; i++)
                        {
                            Rectangle bounds = new Rectangle(i * Width, 0, Width, Height);
                            Bitmap reactionFrame = reactionSheet == null ? null : reactionSheet.Clone(bounds, PixelFormat.Format32bppArgb);
                            bool[] protection = reactionMask == null ? null : ReadAlphaMask(reactionMask, bounds);
                            var frame = new DesktopAppearanceFrame(sheet.Clone(bounds, PixelFormat.Format32bppArgb), reactionFrame, protection);
                            owned.Add(frame); scene.Normal[i] = frame;
                            Bitmap mirror = (Bitmap)frame.Image.Clone();
                            mirror.RotateFlip(RotateFlipType.RotateNoneFlipX);
                            Bitmap reactionMirror = frame.ReactionSource == null ? null : (Bitmap)frame.ReactionSource.Clone();
                            if (reactionMirror != null) reactionMirror.RotateFlip(RotateFlipType.RotateNoneFlipX);
                            var flipped = new DesktopAppearanceFrame(mirror, reactionMirror, protection == null ? null : MirrorMask(protection, Width, Height));
                            owned.Add(flipped); scene.Flipped[i] = flipped;
                        }
                        unique.Add(fingerprint, scene);
                    }
                    scenes.Add(name, new Scene { Normal = scene.Normal, Flipped = scene.Flipped, FrameMs = spec.frameMs, Eyes = spec.eyeAnchors, EyeModes = spec.eyeModeByFrame });
                }
            }
            catch { Dispose(); throw; }
            finally
            {
                if (sheets != null || reactionSheets != null || reactionMasks != null)
                {
                    var released = new HashSet<Bitmap>();
                    if (sheets != null) foreach (Bitmap sheet in sheets.Values) if (sheet != null && released.Add(sheet)) sheet.Dispose();
                    if (reactionSheets != null) foreach (Bitmap sheet in reactionSheets.Values) if (sheet != null && released.Add(sheet)) sheet.Dispose();
                    if (reactionMasks != null) foreach (Bitmap sheet in reactionMasks.Values) if (sheet != null && released.Add(sheet)) sheet.Dispose();
                }
            }
        }

        private static bool[] ReadAlphaMask(Bitmap sheet, Rectangle bounds)
        {
            var result = new bool[bounds.Width * bounds.Height];
            BitmapData data = sheet.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                byte[] row = new byte[bounds.Width * 4];
                for (int y = 0; y < bounds.Height; y++)
                {
                    Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
                    for (int x = 0; x < bounds.Width; x++) result[y * bounds.Width + x] = row[x * 4 + 3] > 0;
                }
            }
            finally { sheet.UnlockBits(data); }
            return result;
        }

        private static bool[] MirrorMask(bool[] source, int width, int height)
        {
            var result = new bool[source.Length];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) result[y * width + (width - 1 - x)] = source[y * width + x];
            return result;
        }

        private DesktopReactionAnchors BuildRubyReactionAnchors(DesktopAppearance descriptor)
        {
            if (descriptor.styleId != "ruby-round-scenes") return null;
            DesktopEyeAnchor[] eyeAnchors = descriptor.reactionEyes;
            DesktopAppearanceScene idle;
            if ((eyeAnchors == null || eyeAnchors.Length != 2) && descriptor.scenes.TryGetValue("idle", out idle)
                && idle != null && idle.eyeAnchors != null && idle.eyeAnchors.Length > 0)
                eyeAnchors = idle.eyeAnchors[0];
            if (eyeAnchors == null || eyeAnchors.Length != 2) return null;
            var eyes = new DesktopReactionPoint[2];
            for (int index = 0; index < eyes.Length; index++)
            {
                DesktopEyeAnchor eye = eyeAnchors[index];
                if (eye == null || eye.width < 4 || eye.height < 4 || eye.x < 0 || eye.y < 0 || eye.x + eye.width > Width || eye.y + eye.height > Height) return null;
                eyes[index] = new DesktopReactionPoint { x = eye.x + eye.width / 2, y = eye.y + eye.height / 2,
                    rx = Math.Max(2, eye.width / 2), ry = Math.Max(2, eye.height / 2) };
            }
            int pawRx = Math.Max(2, (int)Math.Round(Width * .06));
            int pawRy = Math.Max(2, (int)Math.Round(Height * .055));
            int pawY = Math.Min(Height - pawRy - 1, Math.Max(pawRy, (int)Math.Round(Height * .875)));
            return new DesktopReactionAnchors
            {
                width = Width, height = Height, eyes = eyes,
                paws = new[]
                {
                    new DesktopReactionPoint { x = Math.Max(pawRx, (int)Math.Round(Width * .39)), y = pawY, rx = pawRx, ry = pawRy },
                    new DesktopReactionPoint { x = Math.Min(Width - pawRx - 1, (int)Math.Round(Width * .61)), y = pawY, rx = pawRx, ry = pawRy }
                },
                footY = Math.Min(Height, (int)Math.Round(Height * .91))
            };
        }

        // The web renderer treats the 32 x 16 source as two independent 16 x 16
        // eye tiles. Compose them onto the eyeless native sheet before slicing,
        // preserving pixel edges and straight-alpha source-over blending.
        internal static Bitmap ComposeEyes(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors)
        {
            return ComposeEyes(bodySheet, eyePair, frameWidth, frameHeight, frames, anchors, "none");
        }

        internal static Bitmap ComposeEyes(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors, string accessory)
        {
            return ComposeEyes(bodySheet, eyePair, frameWidth, frameHeight, frames, anchors, accessory, null, null, null);
        }

        internal static Bitmap ComposeEyes(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors,
            string accessory, Bitmap accessoryImage, DesktopAccessoryLayer accessoryLayer, string sceneName)
        {
            Bitmap unusedSource, unusedMask;
            return ComposeEyesCore(bodySheet, eyePair, frameWidth, frameHeight, frames, anchors, accessory, accessoryImage, accessoryLayer, sceneName, false, out unusedSource, out unusedMask);
        }

        internal static Bitmap ComposeEyesForReaction(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors,
            string accessory, Bitmap accessoryImage, DesktopAccessoryLayer accessoryLayer, string sceneName, out Bitmap reactionSource)
        {
            Bitmap reactionMask;
            Bitmap result = ComposeEyesCore(bodySheet, eyePair, frameWidth, frameHeight, frames, anchors, accessory, accessoryImage, accessoryLayer, sceneName, true, out reactionSource, out reactionMask);
            if (reactionMask != null) reactionMask.Dispose();
            return result;
        }

        internal static Bitmap ComposeEyesForReaction(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors,
            string accessory, Bitmap accessoryImage, DesktopAccessoryLayer accessoryLayer, string sceneName, out Bitmap reactionSource, out Bitmap reactionMask)
        {
            return ComposeEyesCore(bodySheet, eyePair, frameWidth, frameHeight, frames, anchors, accessory, accessoryImage, accessoryLayer, sceneName, true, out reactionSource, out reactionMask);
        }

        private static Bitmap ComposeEyesCore(Bitmap bodySheet, Bitmap eyePair, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors,
            string accessory, Bitmap accessoryImage, DesktopAccessoryLayer accessoryLayer, string sceneName, bool captureReactionSource,
            out Bitmap reactionSource, out Bitmap reactionMask)
        {
            reactionSource = null; reactionMask = null;
            if (bodySheet == null) throw new ArgumentNullException("bodySheet");
            if (eyePair == null) throw new ArgumentNullException("eyePair");
            if (frameWidth < 1 || frameHeight < 1 || frames < 1 || frames > 8
                || bodySheet.Width != frameWidth * frames || bodySheet.Height != frameHeight
                || eyePair.Width != 32 || eyePair.Height != 16 || anchors == null || anchors.Length != frames)
                throw new InvalidDataException("강아지 눈 레이어 크기를 확인하지 못했어요.");
            foreach (DesktopEyeAnchor[] frame in anchors)
            {
                // An empty validated frame keeps its painted closed eyes (or back-facing head).
                if (frame == null || frame.Length > 2) throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
                foreach (DesktopEyeAnchor eye in frame)
                    if (eye == null || eye.x < 0 || eye.y < 0 || eye.width < 1 || eye.height < 1
                        || eye.x + eye.width > frameWidth || eye.y + eye.height > frameHeight)
                        throw new InvalidDataException("강아지 눈 위치를 확인하지 못했어요.");
            }

            DesktopAccessoryPlacement[] accessoryPlacements = null;
            var placementMap = accessoryLayer == null ? null : Array.IndexOf(DesktopAppearanceCache.NativeActions, sceneName) >= 0
                ? accessoryLayer.nativeActions : accessoryLayer.placements;
            bool dynamicAccessory = accessoryLayer != null && sceneName != null
                && placementMap != null && placementMap.TryGetValue(sceneName, out accessoryPlacements)
                && accessoryPlacements != null && accessoryPlacements.Length == frames
                && (accessoryLayer.renderer == "builtin" || accessoryLayer.renderer == "image" && accessoryImage != null);
            Bitmap output;
            if (dynamicAccessory && accessoryLayer.layer == "behind")
            {
                output = new Bitmap(bodySheet.Width, bodySheet.Height, PixelFormat.Format32bppArgb);
                try
                {
                    DrawAccessoryLayer(output, frameWidth, frameHeight, frames, accessoryImage, accessoryLayer, accessoryPlacements);
                    using (Graphics graphics = Graphics.FromImage(output))
                    {
                        graphics.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceOver;
                        graphics.DrawImageUnscaled(bodySheet, 0, 0);
                    }
                }
                catch { output.Dispose(); throw; }
            }
            else output = DesktopAppearanceCache.DetachedRgba(bodySheet);
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
                bool frontAccessory = dynamicAccessory && accessoryLayer.layer == "front"
                    || !dynamicAccessory && DesktopAccessoryRenderer.IsSupported(accessory) && accessory != "none";
                if (captureReactionSource && frontAccessory)
                {
                    reactionSource = DesktopAppearanceCache.DetachedRgba(output);
                    reactionMask = new Bitmap(output.Width, output.Height, PixelFormat.Format32bppArgb);
                    if (dynamicAccessory) DrawAccessoryLayer(reactionMask, frameWidth, frameHeight, frames, accessoryImage, accessoryLayer, accessoryPlacements);
                    else DesktopAccessoryRenderer.Draw(reactionMask, frameWidth, frameHeight, frames, anchors, accessory);
                }
                if (dynamicAccessory)
                {
                    if (accessoryLayer.layer == "front") DrawAccessoryLayer(output, frameWidth, frameHeight, frames, accessoryImage, accessoryLayer, accessoryPlacements);
                }
                else if (DesktopAccessoryRenderer.IsSupported(accessory)) DesktopAccessoryRenderer.Draw(output, frameWidth, frameHeight, frames, anchors, accessory);
                return output;
            }
            catch
            {
                if (reactionSource != null) { reactionSource.Dispose(); reactionSource = null; }
                if (reactionMask != null) { reactionMask.Dispose(); reactionMask = null; }
                output.Dispose(); throw;
            }
        }

        private static void DrawAccessoryLayer(Bitmap output, int frameWidth, int frameHeight, int frames, Bitmap image,
            DesktopAccessoryLayer layer, DesktopAccessoryPlacement[] placements)
        {
            if (layer.renderer == "builtin") DesktopAccessoryRenderer.DrawBuiltinLayer(output, frameWidth, frameHeight, frames, layer.id, layer.slot, placements);
            else DesktopAccessoryRenderer.DrawLayer(output, frameWidth, frameHeight, frames, image, layer.pivotX.Value, layer.pivotY.Value, placements);
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

        internal static int NativeBellyFrame(double elapsedSeconds, int frameMs)
        {
            if (Double.IsNaN(elapsedSeconds) || Double.IsInfinity(elapsedSeconds) || elapsedSeconds <= 0 || elapsedSeconds >= PetState.BellyDurationSeconds) return 0;
            double transition = Math.Max(.1, frameMs / 1000.0);
            if (elapsedSeconds < transition) return 0;
            if (elapsedSeconds < transition * 2) return 1;
            if (elapsedSeconds > PetState.BellyDurationSeconds - transition) return 0;
            if (elapsedSeconds > PetState.BellyDurationSeconds - transition * 2) return 1;
            return 2 + (int)((elapsedSeconds - transition * 2) / transition) % 2;
        }

        internal static string NativeAction(string scene, string mood, int directionX, int directionY)
        {
            if (scene == "sleep") return null;
            if (mood == "typing" || mood == "excited") return "typing";
            if (mood == "love") return "petting";
            if (Array.IndexOf(DesktopAppearanceCache.NativeActions, mood) >= 0) return mood;
            if (scene == "walk") return directionY < 0 ? "walk-up" : directionY > 0 ? "walk-down" : directionX > 0 ? "walk-right" : "walk-left";
            return null;
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
            return React(scene, mood, training, elapsedSeconds, enabled, flip, gazeX, gazeY, flip ? 1 : -1, 0);
        }

        internal DesktopAppearanceFrame React(string scene, string mood, string training, double elapsedSeconds, bool enabled, bool flip, int gazeX, int gazeY, int directionX, int directionY)
        {
            if (HasNativeActions && enabled && training == null)
            {
                string native = NativeAction(scene, mood, directionX, directionY);
                if (native != null && scenes.ContainsKey(native))
                    return native == "belly" ? Get(native, NativeBellyFrame(elapsedSeconds, scenes[native].FrameMs), false) : At(native, elapsedSeconds, false, false);
            }
            DesktopAppearanceFrame source = At(scene, elapsedSeconds, !enabled && training == null, flip);
            if (!enabled || training != null || scene == "walk" || scene == "sleep" || scene == "side") return source;
            if (reactions == null) reactions = new DesktopAppearanceReactions(this);
            if (HasNativeActions)
            {
                // Closed eyes and hidden faces remain painted. Open eyes use their
                // own frame geometry, including natural winks and tilted heads.
                Scene data = scenes.ContainsKey(scene) ? scenes[scene] : scenes["idle"];
                int index = Double.IsNaN(elapsedSeconds) || Double.IsInfinity(elapsedSeconds) ? 0 : (int)(Math.Max(0, elapsedSeconds) * 1000 / data.FrameMs % data.Normal.Length);
                DesktopReactionAnchors gaze = null;
                if (data.Eyes != null && (data.EyeModes == null || data.EyeModes[index] == "shared"))
                    gaze = GazeAnchors(data.Eyes[index], Width, Height);
                return reactions.Get(source, scene, "idle", elapsedSeconds, gazeX, gazeY, gaze);
            }
            return reactions.Get(source, scene, mood, elapsedSeconds, gazeX, gazeY);
        }

        private static DesktopReactionAnchors GazeAnchors(DesktopEyeAnchor[] values, int width, int height)
        {
            if (values == null || values.Length == 0) return null;
            var eyes = new List<DesktopReactionPoint>();
            foreach (DesktopEyeAnchor eye in values)
            {
                int rx = (eye.width - 1) / 2, ry = (eye.height - 1) / 2;
                if (rx < 2 || ry < 2) continue;
                eyes.Add(new DesktopReactionPoint { x = eye.x + rx, y = eye.y + ry, rx = rx, ry = ry });
            }
            return eyes.Count == 0 ? null : new DesktopReactionAnchors { width = width, height = height, eyes = eyes.ToArray() };
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
