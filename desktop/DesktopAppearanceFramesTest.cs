using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace PuppyRubyDesktop
{
    internal static class DesktopAppearanceFramesTest
    {
        private static readonly string[] Names = { "idle", "side", "walk", "happy", "sleep" };

        internal static void Units(Action<bool, string> check)
        {
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

        internal static int RealFiles(string publicDirectory, string output)
        {
            var report = new List<string>();
            try
            {
                Action<bool, string> check = delegate(bool value, string label) { if (!value) throw new InvalidDataException(label); report.Add("PASS " + label); };
                Units(check);
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
