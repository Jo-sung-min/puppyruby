using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // Standalone, file-only checks: no input hooks, game requests or user profile writes.
    internal static class DesktopAppearanceReactionsTest
    {
        private static readonly List<string> Passed = new List<string>();
        private static readonly string[] Scenes = { "idle", "side", "walk", "happy", "sleep" };
        private static Dictionary<string, Anchor> anchors;
        private static string outputDirectory;
        private sealed class Part { public int x { get; set; } public int y { get; set; } public int rx { get; set; } public int ry { get; set; } }
        private sealed class Anchor { public int width { get; set; } public int height { get; set; } public Part[] eyes { get; set; } public Part[] paws { get; set; } public int footY { get; set; } }

        private static void Check(bool value, string description)
        {
            if (!value) throw new InvalidDataException(description);
            Passed.Add(description);
        }

        internal static int Main(string[] args)
        {
            string reportPath = Path.Combine(args[1], "report.json");
            try
            {
                outputDirectory = args[1];
                anchors = new JavaScriptSerializer().Deserialize<Dictionary<string, Anchor>>(File.ReadAllText(Path.Combine(args[0], "shared", "art16-reaction-anchors.json")));
                Check(anchors.Count == DesktopBreedCatalog.Ids.Length, "Reaction metadata covers every registered breed exactly once");
                VerifyInputs();
                VerifyScenes();
                using (Bitmap overview = new Bitmap(1200, 30 * 176, PixelFormat.Format32bppArgb))
                using (Graphics graphics = Graphics.FromImage(overview))
                {
                    graphics.Clear(Color.FromArgb(23, 25, 32));
                    graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                    graphics.PixelOffsetMode = PixelOffsetMode.Half;
                    int row = 0;
                    foreach (string breed in DesktopBreedCatalog.Ids)
                    {
                        VerifyBreed(args[0], breed, graphics, row++);
                    }
                    overview.Save(Path.Combine(args[1], "all-breed-reactions.png"), ImageFormat.Png);
                }
                File.WriteAllText(reportPath, new JavaScriptSerializer().Serialize(new { passed = Passed.Count, breeds = DesktopBreedCatalog.Ids.Length, networkRequests = 0, gameActions = 0, checks = Passed }));
                Console.WriteLine("PASS " + Passed.Count + " reaction checks for " + DesktopBreedCatalog.Ids.Length + " breeds.");
                return 0;
            }
            catch (Exception error)
            {
                File.WriteAllText(reportPath, new JavaScriptSerializer().Serialize(new { passed = Passed.Count, failure = error.ToString(), checks = Passed }));
                Console.Error.WriteLine(error);
                return 1;
            }
        }

        private static void VerifyInputs()
        {
            var state = new PetState();
            state.Input(InputKind.Keyboard, 1);
            Check(state.Mood(1.1) == "typing", "Keyboard starts a temporary typing reaction");
            state.Input(InputKind.Move, 1.2);
            Check(state.Mood(1.3) == "typing", "Pointer motion preserves an active keyboard reaction");
            for (int i = 0; i < 8; i++) state.Input(InputKind.Keyboard, 2 + i * .03);
            Check(state.Mood(2.3) == "excited", "A keyboard burst starts faster typing");
            Check(state.Mood(3.5) == "idle", "Typing expires and returns to front idle");
            state.Input(InputKind.Scroll, 4);
            Check(state.Mood(4.1) == "scroll", "Scroll reaction remains available");
            state.Input(InputKind.Click, 5);
            Check(state.Mood(5.1) == "play", "Click starts the playful jump reaction");
            state.Input(InputKind.Pet, 6);
            Check(state.Mood(6.1) == "love", "Petting keeps its happy reaction");
            state.Input(InputKind.Drag, 7); state.Input(InputKind.Keyboard, 7.1);
            Check(state.Mood(7.2) == "drag", "Direct dragging wins over keyboard input");
            state.Input(InputKind.Drop, 7.3);
            Check(state.Mood(7.4) == "love", "Dropping the puppy finishes with its petting reaction");
            state.SetEnabled(false, 8);
            foreach (InputKind input in Enum.GetValues(typeof(InputKind))) state.Input(input, 8.1);
            Check(state.Mood(8.2) == "idle", "Pause ignores every global input category");
            state.Train("puppy-bang", 8.3);
            Check(state.Training(8.4) == "puppy-bang" && state.Mood(8.4) == "sleep", "Explicit training still works while global reactions are paused");
            state.SetEnabled(true, 12); state.Input(InputKind.Keyboard, 12.1);
            Check(state.Mood(12.2) == "typing", "Resume clears the old key burst and restores typing");
        }

        private static void VerifyScenes()
        {
            foreach (bool moving in new[] { false, true })
            {
                foreach (string mood in new[] { "typing", "excited" })
                    Check(DesktopAppearanceFrames.SelectScene(mood, null, moving, false, true) == "idle", mood + " faces front even while mouse following is active: " + moving);
                foreach (string mood in new[] { "scroll", "drag" })
                    Check(DesktopAppearanceFrames.SelectScene(mood, null, moving, false, true) == "side", mood + " retains its side reaction while following: " + moving);
                foreach (string mood in new[] { "love", "play" })
                    Check(DesktopAppearanceFrames.SelectScene(mood, null, moving, false, true) == "happy", mood + " wins over following: " + moving);
                Check(DesktopAppearanceFrames.SelectScene("typing", null, moving, false, false) == "idle", "Disabled input returns to a still front pose: " + moving);
                Check(DesktopAppearanceFrames.SelectScene("typing", null, moving, true, true) == "sleep", "Explicit rest selects sleep: " + moving);
                foreach (string command in new[] { "puppy-sit", "puppy-stay", "puppy-turn", "puppy-paw", "puppy-bang" })
                {
                    string expected = command == "puppy-bang" ? "sleep" : command == "puppy-paw" ? "happy" : command == "puppy-turn" ? "side" : "idle";
                    Check(DesktopAppearanceFrames.SelectScene("typing", command, moving, false, true) == expected, command + " keeps intentional training priority: " + moving);
                }
            }
            Check(DesktopAppearanceFrames.SelectScene("idle", null, true, false, true) == "walk", "Uninterrupted following keeps its eight-frame walk");
            Check(DesktopAppearanceFrames.SelectScene("sleep", null, false, false, true) == "idle", "Quiet inactivity keeps front sitting rather than fabricated interaction");
        }

        private static void VerifyBreed(string root, string breed, Graphics overview, int row)
        {
            var descriptor = new DesktopAppearance { version = 1, key = "reaction-test-" + breed, styleId = "art-16-scenes", breedId = breed, scenes = new Dictionary<string, DesktopAppearanceScene>() };
            var sheets = new Dictionary<string, Bitmap>();
            foreach (string scene in Scenes)
            {
                string file = Path.Combine(root, "local-assets", "site", "images", "art16-scenes-v1", breed, scene + ".png");
                using (var stream = new MemoryStream(File.ReadAllBytes(file)))
                using (var image = new Bitmap(stream)) sheets.Add(scene, DesktopAppearanceCache.DetachedRgba(image));
                if (scene == "idle") { descriptor.width = sheets[scene].Width; descriptor.height = sheets[scene].Height; }
                descriptor.scenes.Add(scene, new DesktopAppearanceScene { frames = scene == "walk" ? 8 : 1, frameMs = 125, sha256 = breed + "-" + scene });
            }
            using (var frames = new DesktopAppearanceFrames(descriptor, sheets))
            {
                if (breed == "pomeranian") SaveDetail(frames);
                Anchor anchor = anchors[breed];
                Check(anchor.width == descriptor.width && anchor.height == descriptor.height && anchor.eyes.Length == 2 && anchor.paws.Length == 2, breed + " eye and paw anchors match the full native image");
                byte[] original = Bytes(frames.Get("idle", 0, false).Image);
                byte[] originalSleep = Bytes(frames.Get("sleep", 0, false).Image);
                var left = frames.React("idle", "idle", null, .03, true, false, -1, 0);
                byte[] leftPixels = Bytes(left.Image); Draw(overview, left.Image, 0, row);
                var right = frames.React("idle", "idle", null, .03, true, false, 1, 0);
                byte[] rightPixels = Bytes(right.Image); Draw(overview, right.Image, 1, row);
                Check(!Equal(leftPixels, rightPixels), breed + " changes pupils between left and right gaze");
                var up = frames.React("idle", "idle", null, .03, true, false, 0, -1);
                byte[] upPixels = Bytes(up.Image);
                var down = frames.React("idle", "idle", null, .03, true, false, 0, 1);
                Check(!Equal(upPixels, Bytes(down.Image)), breed + " changes pupils between upward and downward gaze");
                Check(ChangedPixels(original, leftPixels) < descriptor.width * descriptor.height / 30, breed + " gaze modifies less than one thirtieth of the native artwork");
                Check(ChangedPixels(original, rightPixels) < descriptor.width * descriptor.height / 30, breed + " opposite gaze preserves the rest of the artwork");
                Check(UnchangedOutsideEyes(original, leftPixels, anchor) && UnchangedOutsideEyes(original, rightPixels, anchor), breed + " gaze leaves every pixel outside its two eye regions unchanged");
                var typingA = frames.React("idle", "typing", null, .03, true, false, -1, -1);
                byte[] typingAPixels = Bytes(typingA.Image); Draw(overview, typingA.Image, 2, row);
                var typingB = frames.React("idle", "typing", null, .17, true, false, 1, 1);
                byte[] typingBPixels = Bytes(typingB.Image); Draw(overview, typingB.Image, 3, row);
                Check(!Equal(original, typingAPixels), breed + " typing adds visible keyboard and paws");
                Check(!Equal(typingAPixels, typingBPixels), breed + " typing alternates its paw stroke");
                int bodyBoundary = Math.Min(descriptor.height * 2 / 3, Math.Min(anchor.paws[0].y - anchor.paws[0].ry, anchor.paws[1].y - anchor.paws[1].ry) - 20);
                Check(UnchangedAbove(original, typingAPixels, descriptor.width, bodyBoundary) && UnchangedAbove(original, typingBPixels, descriptor.width, bodyBoundary), breed + " typing preserves original face, ears and upper body pixels");
                var typingFront = frames.React("idle", "typing", null, .03, true, false, 1, 1);
                Check(Equal(typingAPixels, Bytes(typingFront.Image)), breed + " typing stays front-facing regardless of gaze direction");
                var excitedA = frames.React("idle", "excited", null, .03, true, false, 0, 0);
                byte[] excitedPixels = Bytes(excitedA.Image);
                var excitedB = frames.React("idle", "excited", null, .09, true, false, 0, 0);
                Check(!Equal(excitedPixels, Bytes(excitedB.Image)), breed + " fast typing alternates sooner than ordinary typing");
                var sleep = frames.React("sleep", "sleep", null, .17, true, false, 1, 1);
                Check(Equal(originalSleep, Bytes(sleep.Image)), breed + " closed sleeping eyes and artwork remain unchanged");
                var pausedA = frames.React("idle", "typing", null, .03, false, false, -1, -1);
                byte[] pausedPixels = Bytes(pausedA.Image);
                var pausedB = frames.React("idle", "excited", null, 11.17, false, false, 1, 1);
                Check(Equal(original, pausedPixels) && Equal(pausedPixels, Bytes(pausedB.Image)), breed + " pause freezes original front pose with no keyboard or gaze reaction");
                Check(Equal(original, Bytes(frames.Get("idle", 0, false).Image)), breed + " all animations leave source art pixels immutable");
                var happy = frames.React("happy", "love", null, .03, true, false, 0, 0); Draw(overview, happy.Image, 4, row);
                foreach (string mood in new[] { "idle", "typing", "excited", "love", "eat", "play", "scroll", "drag" })
                    for (int x = -1; x <= 1; x++)
                        for (int y = -1; y <= 1; y++)
                        {
                            string scene = DesktopAppearanceFrames.SelectScene(mood, null, false, false, true);
                            var image = frames.React(scene, mood, null, .03 + (x + y + 2) * .1, true, false, x, y);
                            Check(image.Image.Width == descriptor.width && image.Image.Height == descriptor.height, breed + " " + mood + " keeps full native dimensions " + x + "," + y);
                            Check(MaskMatches(image), breed + " " + mood + " alpha hit map matches the visible reaction " + x + "," + y);
                        }
                Check(frames.ReactionFrameCount <= 24 && frames.ReactionPixelCount <= 16L * 1024 * 1024, breed + " repeated input keeps reaction memory bounded");
                using (var font = new Font("Segoe UI", 11)) overview.DrawString(breed, font, Brushes.White, 1010, row * 176 + 75);
            }
        }

        private static void Draw(Graphics graphics, Bitmap image, int column, int row)
        {
            double scale = 166.0 / Math.Max(image.Width, image.Height);
            var target = new Rectangle(column * 200 + (200 - (int)(image.Width * scale)) / 2, row * 176 + 5, (int)(image.Width * scale), (int)(image.Height * scale));
            graphics.DrawImage(image, target, 0, 0, image.Width, image.Height, GraphicsUnit.Pixel);
        }

        private static void SaveDetail(DesktopAppearanceFrames frames)
        {
            string[] labels = { "neutral", "look-left", "look-right", "typing-left", "typing-right", "petting" };
            using (var preview = new Bitmap(frames.Width * 3, (frames.Height + 28) * 2, PixelFormat.Format32bppArgb))
            using (Graphics graphics = Graphics.FromImage(preview))
            using (var font = new Font("Segoe UI", 11))
            {
                graphics.Clear(Color.FromArgb(23, 25, 32));
                for (int i = 0; i < labels.Length; i++)
                {
                    DesktopAppearanceFrame image = i == 0 ? frames.Get("idle", 0, false)
                        : i < 3 ? frames.React("idle", "idle", null, .03, true, false, i == 1 ? -1 : 1, 0)
                        : i < 5 ? frames.React("idle", "typing", null, i == 3 ? .03 : .17, true, false, 0, 0)
                        : frames.React("happy", "love", null, .03, true, false, 0, 0);
                    image.Image.Save(Path.Combine(outputDirectory, "pomeranian-" + labels[i] + ".png"), ImageFormat.Png);
                    int x = i % 3 * frames.Width, y = i / 3 * (frames.Height + 28);
                    graphics.DrawImageUnscaled(image.Image, x, y + 28);
                    graphics.DrawString(labels[i], font, Brushes.White, x + 10, y + 4);
                }
                preview.Save(Path.Combine(outputDirectory, "pomeranian-native-reactions.png"), ImageFormat.Png);
            }
        }

        private static bool MaskMatches(DesktopAppearanceFrame frame)
        {
            byte[] pixels = Bytes(frame.Image);
            for (int i = 0; i < frame.Opaque.Length; i++) if (frame.Opaque[i] != (pixels[i * 4 + 3] > 0)) return false;
            return frame.Opaque.Length == frame.Image.Width * frame.Image.Height;
        }

        private static int ChangedPixels(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return Int32.MaxValue;
            int changed = 0;
            for (int i = 0; i < a.Length; i += 4)
                if (a[i] != b[i] || a[i + 1] != b[i + 1] || a[i + 2] != b[i + 2] || a[i + 3] != b[i + 3]) changed++;
            return changed;
        }

        private static bool UnchangedOutsideEyes(byte[] a, byte[] b, Anchor anchor)
        {
            for (int y = 0; y < anchor.height; y++)
                for (int x = 0; x < anchor.width; x++)
                {
                    bool eye = false;
                    foreach (Part part in anchor.eyes)
                        if (Math.Abs(x - part.x) <= part.rx + 4 && Math.Abs(y - part.y) <= part.ry + 4) { eye = true; break; }
                    if (eye) continue;
                    int index = (y * anchor.width + x) * 4;
                    for (int channel = 0; channel < 4; channel++) if (a[index + channel] != b[index + channel]) return false;
                }
            return true;
        }

        private static bool UnchangedAbove(byte[] a, byte[] b, int width, int y)
        {
            int length = Math.Max(0, Math.Min(a.Length, y * width * 4));
            for (int i = 0; i < length; i++) if (a[i] != b[i]) return false;
            return true;
        }

        private static bool Equal(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
            return true;
        }

        private static byte[] Bytes(Bitmap bitmap)
        {
            var result = new byte[bitmap.Width * bitmap.Height * 4];
            BitmapData data = bitmap.LockBits(new Rectangle(Point.Empty, bitmap.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try { for (int y = 0; y < bitmap.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), result, y * bitmap.Width * 4, bitmap.Width * 4); }
            finally { bitmap.UnlockBits(data); }
            return result;
        }
    }
}
