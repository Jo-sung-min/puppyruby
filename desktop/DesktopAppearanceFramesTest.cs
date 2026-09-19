using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    public sealed class RubyRoundTestManifest
    {
        public int version { get; set; }
        public bool complete { get; set; }
        public RubyRoundTestBreed[] breeds { get; set; }
    }

    public sealed class RubyRoundTestBreed
    {
        public string breed { get; set; }
        public int width { get; set; }
        public int height { get; set; }
        public Dictionary<string, RubyRoundTestScene> scenes { get; set; }
    }

    public sealed class RubyRoundTestScene
    {
        public string png { get; set; }
        public string desktopPng { get; set; }
        public int frames { get; set; }
        public int desktopFrames { get; set; }
        public RubyRoundTestAnchor[][] eyes { get; set; }
    }

    public sealed class RubyRoundTestAnchor
    {
        public int x { get; set; }
        public int y { get; set; }
        public int width { get; set; }
        public int height { get; set; }
    }

    internal static class DesktopAppearanceFramesTest
    {
        private static readonly string[] Names = { "idle", "side", "walk", "happy", "sleep" };

        internal static void Units(Action<bool, string> check)
        {
            LayeredEyeUnits(check);
            var spec = new DesktopAppearance { version = 1, key = "frame-test", styleId = "art-16-scenes", breedId = "pomeranian", width = 31, height = 17, scenes = new Dictionary<string, DesktopAppearanceScene>() };
            var sheets = new Dictionary<string, Bitmap>();
            foreach (string name in Names)
            {
                int count = name == "walk" ? 8 : 1;
                spec.scenes.Add(name, new DesktopAppearanceScene { frames = count, frameMs = 125, sha256 = name });
                Bitmap sheet = new Bitmap(spec.width * count, spec.height, PixelFormat.Format32bppArgb);
                for (int i = 0; i < count; i++)
                {
                    sheet.SetPixel(i * spec.width + 2, 5, Color.FromArgb(255, 11 + i, 79, 121));
                    sheet.SetPixel(i * spec.width + 29, 15, Color.FromArgb(127, 15, 26, 37));
                }
                sheets.Add(name, sheet);
            }
            using (var frames = new DesktopAppearanceFrames(spec, sheets))
            {
                check(frames.Width == 31 && frames.Height == 17, "downloaded sprite preserves a non-square native canvas");
                check(frames.CachedFrameCount == 24, "five-scene appearance uses a bounded 24 cached original and mirrored frames");
                for (int i = 0; i < 8; i++)
                {
                    DesktopAppearanceFrame current = frames.At("walk", i * .125, false, false);
                    check(current.Image.GetPixel(2, 5).R == 11 + i, "walking selects independently drawn frame " + i + " at 125ms");
                    check(current.Opaque[5 * 31 + 2] && current.Opaque[15 * 31 + 29] && !current.Opaque[0], "walking native-size hit mask keeps partial alpha and transparent margins " + i);
                    check(frames.Get("walk", i, true).Image.GetPixel(28, 5).ToArgb() == current.Image.GetPixel(2, 5).ToArgb(), "walking reverses its horizontal direction without recoloring frame " + i);
                }
                check(Object.ReferenceEquals(frames.At("walk", 1, false, false), frames.Get("walk", 0, false)), "eight-frame walking loops after one second");
                check(Object.ReferenceEquals(frames.At("walk", .75, true, false), frames.Get("walk", 0, false)), "paused animation stays on the first frame");
                Rectangle target = new Rectangle(10, 20, 310, 170);
                check(PetWindow.IsOpaque(frames.Get("idle", 0, false).Image, target, new Point(35, 75)), "native alpha hit testing scales non-square images");
                check(!PetWindow.IsOpaque(frames.Get("idle", 0, false).Image, target, new Point(12, 22)), "transparent native frame pixels do not capture the cursor");
            }
            check(DesktopAppearanceFrames.SelectScene("sleep", null, false, false, true) == "idle", "inactivity faces forward seated instead of silently switching to sleep");
            check(DesktopAppearanceFrames.SelectScene("typing", null, true, false, true) == "idle", "typing stays front-facing while cursor following is active");
            check(DesktopAppearanceFrames.SelectScene("idle", null, true, false, true) == "walk", "uninterrupted cursor following uses the eight-frame walking scene");
            check(DesktopAppearanceFrames.SelectScene("idle", null, false, true, true) == "sleep", "explicit rest uses the sleeping scene");
            check(DesktopAppearanceFrames.SelectScene("love", null, false, false, true) == "happy", "petting uses the happy scene");
            check(DesktopAppearanceFrames.SelectScene("scroll", null, false, false, true) == "side", "scrolling uses the side scene");
            check(DesktopAppearanceFrames.SelectScene("sleep", "puppy-bang", false, false, true) == "sleep", "successful bang training uses the sleeping pose");
            check(DesktopAppearanceFrames.SelectScene("typing", "puppy-paw", false, false, false) == "happy", "intentional paw training works while global input is paused");
            check(DesktopAppearanceFrames.SelectScene("love", null, false, false, false) == "idle", "paused input displays the front seated pose");
            Size size = DesktopAppearanceFrames.DisplaySize(362, 392, 3);
            check(size.Height == 288 && Math.Abs(size.Width / (double)size.Height - 362 / 392.0) < .004, "desktop size preserves native pixel art proportions");
            var shared = new Dictionary<string, Bitmap>();
            foreach (string name in Names)
            {
                spec.scenes[name] = new DesktopAppearanceScene { frames = 1, frameMs = 125, sha256 = "same-static-art" };
                shared.Add(name, new Bitmap(31, 17, PixelFormat.Format32bppArgb));
            }
            using (var frames = new DesktopAppearanceFrames(spec, shared))
                check(frames.CachedFrameCount == 2 && Object.ReferenceEquals(frames.Get("idle", 0, false), frames.Get("sleep", 0, false)), "original art shared by all five scenes is decoded once for each direction");
        }

        private static void LayeredEyeUnits(Action<bool, string> check)
        {
            Color firstBody = Color.FromArgb(255, 23, 41, 67);
            Color secondBody = Color.FromArgb(255, 31, 83, 47);
            using (var body = new Bitmap(24, 10, PixelFormat.Format32bppArgb))
            using (var eyes = new Bitmap(32, 16, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(body))
                {
                    graphics.Clear(firstBody);
                    using (var brush = new SolidBrush(secondBody)) graphics.FillRectangle(brush, 12, 0, 12, 10);
                }
                using (Graphics graphics = Graphics.FromImage(eyes))
                {
                    graphics.Clear(Color.Transparent);
                    using (var left = new SolidBrush(Color.FromArgb(255, 231, 51, 63))) graphics.FillRectangle(left, 0, 0, 16, 16);
                    using (var right = new SolidBrush(Color.FromArgb(255, 43, 103, 239))) graphics.FillRectangle(right, 16, 0, 16, 16);
                }
                DesktopEyeAnchor[][] anchors =
                {
                    new[] { new DesktopEyeAnchor { x = 1, y = 2, width = 2, height = 2 }, new DesktopEyeAnchor { x = 7, y = 2, width = 3, height = 2 } },
                    new[] { new DesktopEyeAnchor { x = 4, y = 5, width = 4, height = 3 }, new DesktopEyeAnchor { x = 9, y = 5, width = 2, height = 3 } }
                };
                using (Bitmap composed = DesktopAppearanceFrames.ComposeEyes(body, eyes, 12, 10, 2, anchors))
                {
                    check(composed.Width == 24 && composed.Height == 10, "layered eyes preserve the complete two-frame sheet dimensions");
                    check(composed.GetPixel(1, 2).R == 231 && composed.GetPixel(2, 3).R == 231, "the left eye half scales into the first anchor");
                    check(composed.GetPixel(7, 2).B == 239 && composed.GetPixel(9, 3).B == 239, "the right eye half scales independently into the second anchor");
                    check(composed.GetPixel(12 + 4, 5).R == 231 && composed.GetPixel(12 + 7, 7).R == 231, "later-frame left eyes use that frame's shifted and scaled anchor");
                    check(composed.GetPixel(12 + 9, 5).B == 239 && composed.GetPixel(12 + 10, 7).B == 239, "later-frame right eyes stay paired with the left eye");
                    check(composed.GetPixel(0, 0).ToArgb() == firstBody.ToArgb() && composed.GetPixel(12, 0).ToArgb() == secondBody.ToArgb(), "eye composition preserves body pixels outside the anchors");
                }
                using (var transparentEyes = new Bitmap(32, 16, PixelFormat.Format32bppArgb))
                using (Bitmap composed = DesktopAppearanceFrames.ComposeEyes(body, transparentEyes, 12, 10, 2, anchors))
                    check(composed.GetPixel(1, 2).ToArgb() == firstBody.ToArgb() && composed.GetPixel(12 + 9, 5).ToArgb() == secondBody.ToArgb(), "transparent eye pixels preserve the body inside each eye anchor");
            }

            using (var body = new Bitmap(64, 64, PixelFormat.Format32bppArgb))
            using (var eyes = new Bitmap(32, 16, PixelFormat.Format32bppArgb))
            {
                DesktopEyeAnchor[][] anchors = { new[] { new DesktopEyeAnchor { x = 23, y = 25, width = 6, height = 6 }, new DesktopEyeAnchor { x = 35, y = 25, width = 6, height = 6 } } };
                foreach (string accessory in new[] { "ribbon", "scarf", "crown", "bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings" })
                using (Bitmap composed = DesktopAppearanceFrames.ComposeEyes(body, eyes, 64, 64, 1, anchors, accessory))
                {
                    bool visible = false;
                    for (int y = 0; y < composed.Height && !visible; y++) for (int x = 0; x < composed.Width; x++) if (composed.GetPixel(x, y).A > 0) { visible = true; break; }
                    check(visible, "web accessory " + accessory + " is composed into the desktop Ruby frame");
                }
            }

            string legacyKey = new string('a', 64), renderedKey = new string('b', 64);
            var legacy = new DesktopAppearance { key = legacyKey };
            check(legacy.EffectiveKey == legacyKey, "legacy appearance identity remains its original key");
            legacy.renderKey = renderedKey;
            check(legacy.EffectiveKey == renderedKey, "layered eye selection uses the render key as its cache identity");

            DesktopAppearance valid = LayeredDescriptor();
            DesktopAppearanceCache.Validate(valid, "https://puppyruby.com");
            check(valid.EffectiveKey == new string('b', 64), "a complete layered descriptor passes strict validation and exposes its render key");

            DesktopAppearance partial = LayeredDescriptor();
            partial.scenes["sleep"].eyeUrl = null;
            check(ThrowsInvalidData(delegate { DesktopAppearanceCache.Validate(partial, "https://puppyruby.com"); }), "a partially populated layered scene is rejected");

            DesktopAppearance mixed = LayeredDescriptor();
            DesktopAppearanceScene side = mixed.scenes["side"];
            side.bodyUrl = null; side.bodySha256 = null; side.bodyFrames = 0;
            side.eyeUrl = null; side.eyeSha256 = null; side.eyeStyle = null; side.eyeAnchors = null;
            check(ThrowsInvalidData(delegate { DesktopAppearanceCache.Validate(mixed, "https://puppyruby.com"); }), "layered and legacy scenes cannot be mixed in one descriptor");

            DesktopAppearance badAnchor = LayeredDescriptor();
            badAnchor.scenes["idle"].eyeAnchors[0][1].x = 115;
            check(ThrowsInvalidData(delegate { DesktopAppearanceCache.Validate(badAnchor, "https://puppyruby.com"); }), "an eye anchor outside its frame is rejected");

            DesktopAppearance badEye = LayeredDescriptor();
            badEye.scenes["happy"].eyeStyle = "ruby-eye-31";
            check(ThrowsInvalidData(delegate { DesktopAppearanceCache.Validate(badEye, "https://puppyruby.com"); }), "an unknown eye style is rejected");

            DesktopAppearance badAccessory = LayeredDescriptor();
            badAccessory.accessory = "../../retired-sprite";
            check(ThrowsInvalidData(delegate { DesktopAppearanceCache.Validate(badAccessory, "https://puppyruby.com"); }), "an unknown desktop accessory is rejected");
        }

        private static DesktopAppearance LayeredDescriptor()
        {
            var descriptor = new DesktopAppearance
            {
                version = 1,
                key = new string('a', 64),
                renderKey = new string('b', 64),
                styleId = "ruby-round-scenes",
                styleName = "Ruby Round",
                breedId = "pomeranian",
                width = 120,
                height = 120,
                scenes = new Dictionary<string, DesktopAppearanceScene>()
            };
            foreach (string name in Names)
            {
                int legacyFrames = name == "walk" ? 8 : 1;
                descriptor.scenes.Add(name, new DesktopAppearanceScene
                {
                    url = "https://puppyruby.com/images/legacy-" + name + ".png",
                    sha256 = new string('c', 64),
                    frames = legacyFrames,
                    frameMs = 125,
                    bodyUrl = "https://puppyruby.com/images/body-" + name + ".png",
                    bodySha256 = new string('d', 64),
                    bodyFrames = 2,
                    eyeUrl = "https://puppyruby.com/images/ruby-eye-02.png",
                    eyeSha256 = new string('e', 64),
                    eyeStyle = "ruby-eye-02",
                    eyeAnchors = new[]
                    {
                        new[] { new DesktopEyeAnchor { x = 24, y = 34, width = 12, height = 10 }, new DesktopEyeAnchor { x = 60, y = 34, width = 12, height = 10 } },
                        new[] { new DesktopEyeAnchor { x = 25, y = 35, width = 12, height = 10 }, new DesktopEyeAnchor { x = 61, y = 35, width = 12, height = 10 } }
                    }
                });
            }
            return descriptor;
        }

        private static bool ThrowsInvalidData(Action action)
        {
            try { action(); return false; }
            catch (InvalidDataException) { return true; }
        }

        internal static int RealFiles(string publicDirectory, string output)
        {
            var report = new List<string>();
            try
            {
                Action<bool, string> check = delegate(bool value, string label) { if (!value) throw new InvalidDataException(label); report.Add("PASS " + label); };
                Units(check);
                VerifyRubyRoundLayers(publicDirectory, check);
                foreach (string breed in DesktopBreedCatalog.Ids)
                {
                    string directory = Path.Combine(publicDirectory, "images", "art16-scenes-v1", breed);
                    var spec = new DesktopAppearance { version = 1, key = "real-test-" + breed, styleId = "art-16-scenes", breedId = breed, scenes = new Dictionary<string, DesktopAppearanceScene>() };
                    var sheets = new Dictionary<string, Bitmap>();
                    var pixels = new Dictionary<string, byte[]>();
                    foreach (string name in Names)
                    {
                        byte[] file = File.ReadAllBytes(Path.Combine(directory, name + ".png"));
                        using (var stream = new MemoryStream(file)) using (var source = new Bitmap(stream))
                        {
                            Bitmap bitmap = DesktopAppearanceCache.DetachedRgba(source);
                            if (name == "idle") { spec.width = bitmap.Width; spec.height = bitmap.Height; }
                            sheets.Add(name, bitmap); pixels.Add(name, Bytes(bitmap));
                        }
                        using (SHA256 sha = SHA256.Create()) spec.scenes.Add(name, new DesktopAppearanceScene { frames = name == "walk" ? 8 : 1, frameMs = 125, sha256 = BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "") });
                    }
                    using (var frames = new DesktopAppearanceFrames(spec, sheets))
                    {
                        foreach (string name in Names)
                        {
                            int count = spec.scenes[name].frames;
                            for (int frame = 0; frame < count; frame++)
                            {
                                DesktopAppearanceFrame image = frames.Get(name, frame, false);
                                byte[] actual = Bytes(image.Image), source = pixels[name];
                                bool equal = true;
                                for (int y = 0; y < spec.height && equal; y++)
                                    for (int x = 0; x < spec.width * 4; x++)
                                        if (actual[y * spec.width * 4 + x] != source[(y * spec.width * count + frame * spec.width) * 4 + x]) { equal = false; break; }
                                check(equal, breed + " " + name + " frame " + frame + " preserves every native RGBA channel");
                            }
                        }
                        if (breed == "pomeranian")
                        {
                            using (var preview = new Bitmap(1440, 340, PixelFormat.Format32bppArgb))
                            using (Graphics graphics = Graphics.FromImage(preview))
                            {
                                graphics.Clear(Color.FromArgb(22, 24, 31));
                                for (int i = 0; i < Names.Length; i++)
                                {
                                    Size display = DesktopAppearanceFrames.DisplaySize(spec.width, spec.height, 3);
                                    PetWindow.DrawPet(graphics, frames.Get(Names[i], Names[i] == "walk" ? 3 : 0, false).Image, new Rectangle(i * 288 + (288 - display.Width) / 2, 20, display.Width, display.Height));
                                }
                                preview.Save(Path.ChangeExtension(output, ".png"), ImageFormat.Png);
                            }
                        }
                    }
                }
                string original = Path.Combine(publicDirectory, "images", "pixel-art-dogs-v1", "art-16.png");
                using (Bitmap bitmap = new Bitmap(original))
                {
                    var spec = new DesktopAppearance { version = 1, key = "original-art-16", styleId = "art-16", breedId = "pomeranian", width = bitmap.Width, height = bitmap.Height, scenes = new Dictionary<string, DesktopAppearanceScene>() };
                    var sheets = new Dictionary<string, Bitmap>();
                    foreach (string name in Names) { spec.scenes.Add(name, new DesktopAppearanceScene { frames = 1, frameMs = 125, sha256 = "original-art-16" }); sheets.Add(name, DesktopAppearanceCache.DetachedRgba(bitmap)); }
                    using (var frames = new DesktopAppearanceFrames(spec, sheets))
                    {
                        byte[] before = Bytes(bitmap), after = Bytes(frames.Get("idle", 0, false).Image);
                        bool equal = before.Length == after.Length;
                        for (int i = 0; i < before.Length && equal; i++) if (before[i] != after[i]) equal = false;
                        check(equal && frames.Width == bitmap.Width && frames.Height == bitmap.Height, "original art 16 retains all native pixels instead of a classic replacement");
                        check(frames.CachedFrameCount == 2, "original art 16 uses only two cached direction images at full resolution");
                    }
                }
                File.WriteAllLines(output, report.ToArray()); return 0;
            }
            catch (Exception error) { report.Add("FAIL " + error); File.WriteAllLines(output, report.ToArray()); return 1; }
        }

        private static void VerifyRubyRoundLayers(string publicDirectory, Action<bool, string> check)
        {
            string manifestPath = Path.Combine(publicDirectory, "images", "ruby-round-v1", "manifest.json");
            RubyRoundTestManifest manifest = new JavaScriptSerializer().Deserialize<RubyRoundTestManifest>(File.ReadAllText(manifestPath));
            check(manifest != null && manifest.version == 1 && manifest.complete && manifest.breeds != null && manifest.breeds.Length == 30,
                "Ruby Round public manifest contains all 30 completed breeds");
            var expectedBreeds = new HashSet<string>(DesktopBreedCatalog.Ids, StringComparer.Ordinal);
            var seenBreeds = new HashSet<string>(StringComparer.Ordinal);
            int sceneCount = 0, representedFrames = 0;
            long comparedPixels = 0;
            foreach (RubyRoundTestBreed breed in manifest.breeds)
            {
                check(breed != null && expectedBreeds.Contains(breed.breed) && seenBreeds.Add(breed.breed)
                    && breed.width > 0 && breed.height > 0 && breed.scenes != null && breed.scenes.Count == Names.Length,
                    "Ruby Round manifest has one valid entry for " + (breed == null ? "unknown breed" : breed.breed));
                foreach (string name in Names)
                {
                    RubyRoundTestScene scene;
                    check(breed.scenes.TryGetValue(name, out scene) && scene != null && scene.frames == 4
                        && scene.desktopFrames == (name == "walk" ? 4 : 1) && scene.eyes != null && scene.eyes.Length == scene.frames,
                        breed.breed + " " + name + " exposes four body frames and its desktop frame count");
                    DesktopEyeAnchor[][] anchors = new DesktopEyeAnchor[scene.eyes.Length][];
                    for (int frame = 0; frame < scene.eyes.Length; frame++)
                    {
                        RubyRoundTestAnchor[] source = scene.eyes[frame];
                        check(source != null && source.Length >= 1 && source.Length <= 2,
                            breed.breed + " " + name + " frame " + frame + " has a bounded eye pair");
                        anchors[frame] = new DesktopEyeAnchor[source.Length];
                        for (int side = 0; side < source.Length; side++)
                            anchors[frame][side] = new DesktopEyeAnchor { x = source[side].x, y = source[side].y, width = source[side].width, height = source[side].height };
                    }
                    string bodyPath = PublicFile(publicDirectory, scene.png);
                    string desktopPath = PublicFile(publicDirectory, scene.desktopPng);
                    string eyePath = Path.Combine(publicDirectory, "images", "ruby-round-v1", "eyes", name == "sleep" ? "eye-10.png" : "eye-01.png");
                    using (var body = new Bitmap(bodyPath))
                    using (var eyes = new Bitmap(eyePath))
                    using (Bitmap composed = DesktopAppearanceFrames.ComposeEyes(body, eyes, breed.width, breed.height, scene.frames, anchors))
                    using (var expected = new Bitmap(desktopPath))
                    {
                        check(expected.Width == breed.width * scene.desktopFrames && expected.Height == breed.height,
                            breed.breed + " " + name + " desktop fallback has the represented native dimensions");
                        byte[] actualPixels = Bytes(composed), expectedPixels = Bytes(expected);
                        int actualStride = composed.Width * 4, expectedStride = expected.Width * 4;
                        bool equal = true;
                        for (int y = 0; y < expected.Height && equal; y++)
                            for (int x = 0; x < expectedStride; x++)
                                if (actualPixels[y * actualStride + x] != expectedPixels[y * expectedStride + x]) { equal = false; break; }
                        check(equal, breed.breed + " " + name + " layered default eyes reproduce every desktop fallback pixel");
                        comparedPixels += (long)expected.Width * expected.Height;
                    }
                    sceneCount++;
                    representedFrames += scene.desktopFrames;
                }
            }
            check(seenBreeds.SetEquals(expectedBreeds) && sceneCount == 150 && representedFrames == 240,
                "Ruby Round layer verification covers 30 breeds, 150 scenes, 240 represented frames and " + comparedPixels + " pixels");
        }

        private static string PublicFile(string publicDirectory, string webPath)
        {
            if (String.IsNullOrWhiteSpace(webPath) || webPath[0] != '/' || webPath.IndexOf('\\') >= 0) throw new InvalidDataException("Invalid public asset path.");
            string root = Path.GetFullPath(publicDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string file = Path.GetFullPath(Path.Combine(root, webPath.Substring(1).Replace('/', Path.DirectorySeparatorChar)));
            if (!file.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Public asset escaped its root.");
            return file;
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
