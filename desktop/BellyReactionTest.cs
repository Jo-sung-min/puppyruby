using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // No native hooks are installed: input times and categories are deterministic fixtures.
    internal static class BellyReactionTest
    {
        private static readonly List<string> Passed = new List<string>();
        private static void Check(bool value, string label) { if (!value) throw new InvalidDataException(label); Passed.Add(label); }
        internal static int Main(string[] args)
        {
            string report = Path.Combine(args[1], "report.json");
            try
            {
                StateChecks();
                Check(NativeInput.MouseInput(0x201) == InputKind.Click, "Left mouse down is the primary click category");
                Check(NativeInput.MouseInput(0x204) == InputKind.AuxiliaryClick && NativeInput.MouseInput(0x207) == InputKind.AuxiliaryClick, "Right and middle clicks cannot increment the primary gesture");
                Check(NativeInput.MouseInput(0x20A) == InputKind.Scroll && NativeInput.MouseInput(0x20E) == InputKind.Scroll, "Vertical and horizontal wheel events retain scroll reactions");
                Check(NativeInput.MouseInput(0x202) == null && NativeInput.MouseInput(0x200) == null, "Mouse up and movement cannot double count a click");
                foreach (double time in new[] { Double.NaN, Double.PositiveInfinity, Double.NegativeInfinity, -10.0, 0.0, 2.4, 100.0 })
                    Check(DesktopAppearanceReactions.BellyAngle(time) == 0, "Invalid, not-started and completed belly time is upright: " + time);
                foreach (double time in new[] { .4, .8, 1.2, 1.6, 2.0 })
                    Check(DesktopAppearanceReactions.BellyAngle(time) >= 174 && DesktopAppearanceReactions.BellyAngle(time) <= 186, "Middle belly phase remains belly-up instead of spinning: " + time);
                Check(DesktopAppearanceFrames.SelectScene("belly", null, true, false, true) == "idle", "Belly uses the native front pose and wins over following");
                Check(DesktopAppearanceFrames.SelectScene("belly", null, true, false, false) == "idle", "Pause returns belly to a still front pose");
                foreach (string breed in DesktopBreedCatalog.Ids) RenderChecks(args[0], args[1], breed);
                File.WriteAllText(report, new JavaScriptSerializer().Serialize(new { passed = Passed.Count, checks = Passed, networkRequests = 0, gameActions = 0 }));
                Console.WriteLine("PASS " + Passed.Count + " belly gesture and native geometry checks."); return 0;
            }
            catch (Exception error)
            {
                File.WriteAllText(report, new JavaScriptSerializer().Serialize(new { passed = Passed.Count, failure = error.ToString(), checks = Passed }));
                Console.Error.WriteLine(error); return 1;
            }
        }

        private static PetState Burst(double start)
        {
            var state = new PetState();
            for (int i = 0; i < 5; i++) state.Input(InputKind.Click, start + i * .1);
            return state;
        }

        private static void StateChecks()
        {
            var state = new PetState();
            double[] boundary = { 1, 1.3, 1.6, 1.9, 2.2 };
            for (int i = 0; i < 4; i++) { state.Input(InputKind.Click, boundary[i]); Check(state.Mood(boundary[i]) == "play", "First four clicks retain their hop " + i); }
            state.Input(InputKind.Click, boundary[4]);
            Check(state.Mood(2.2) == "belly" && Math.Abs(state.BellyStartedAt - 2.2) < .000001, "Five primary clicks on the inclusive 1.2 second boundary start belly");
            foreach (InputKind input in new[] { InputKind.Click, InputKind.AuxiliaryClick, InputKind.Keyboard, InputKind.Scroll, InputKind.Pet, InputKind.Move })
            { state.Input(input, 2.5); Check(state.Mood(2.6) == "belly", input + " does not clobber an active belly"); }
            Check(state.Mood(4.599) == "belly", "Belly persists for the full 2.4 seconds");
            Check(state.Mood(4.6) == "idle", "Other input does not extend belly past its original deadline");
            state.Input(InputKind.Click, 4.7); Check(state.Mood(4.7) == "play", "New clicks after belly start a fresh burst");
            state = new PetState();
            for (int i = 0; i < 5; i++)
            {
                state.Input(InputKind.Click, 1 + i * .1);
                state.Input(InputKind.Pet, 1.01 + i * .1);
            }
            Check(state.Mood(1.42) == "belly", "Actual mouse-up petting after every dog click cannot clear the burst or fifth-click belly");
            state.Input(InputKind.Drop, 1.5);
            Check(state.Mood(1.6) == "belly", "Capture release without a real drag cannot clobber belly");
            state = new PetState();
            for (int i = 0; i < 5; i++) state.Input(InputKind.Click, 1 + i * .301);
            Check(state.Mood(2.204) != "belly", "Five slow clicks outside the rolling window do not trigger belly");
            state = new PetState();
            for (int i = 0; i < 30; i++) state.Input(InputKind.AuxiliaryClick, 1 + i * .01);
            Check(state.Mood(1.3) != "belly", "Right and middle clicks do not trigger belly");
            for (int i = 0; i < 4; i++) state.Input(InputKind.Click, 1.4 + i * .1);
            Check(state.Mood(1.8) != "belly", "Auxiliary clicks do not contribute to a subsequent primary burst");
            state = Burst(1); state.Input(InputKind.Drag, 1.5);
            Check(state.Mood(1.6) == "drag", "Direct drag cancels belly immediately");
            state.Input(InputKind.Drop, 1.7);
            Check(state.Mood(1.8) == "love", "Drop remains a petting reaction after cancelling belly");
            state = new PetState();
            for (int i = 0; i < 4; i++) state.Input(InputKind.Click, 1 + i * .1);
            state.Input(InputKind.Drag, 1.4); state.Input(InputKind.Drop, 1.5); state.Input(InputKind.Click, 1.6);
            Check(state.Mood(1.7) != "belly", "Drag clears a partial click burst");
            state = Burst(1); state.SetEnabled(false, 1.5);
            Check(state.Mood(1.6) == "idle", "Pause cancels belly");
            state.SetEnabled(true, 1.7); state.Input(InputKind.Click, 1.8);
            Check(state.Mood(1.9) == "play", "Pause and resume clear the previous gesture");
            state = Burst(1); state.Train("puppy-sit", 1.5);
            Check(state.Mood(1.6) == "idle" && state.Training(1.6) == "puppy-sit", "Explicit training cancels belly and owns the pose");
            Check(state.Mood(5.1) == "idle", "Finished training cannot resume a cancelled belly");
            state = new PetState();
            for (int i = 0; i < 4; i++) state.Input(InputKind.Click, 1 + i * .1);
            state.Input(InputKind.Click, Double.NaN); state.Input(InputKind.Click, Double.PositiveInfinity);
            Check(state.Mood(1.35) != "belly", "Invalid input times cannot fabricate gesture clicks");
            state.Input(InputKind.Click, .5); state.Input(InputKind.Click, .6);
            Check(state.Mood(.6) != "belly", "Backward clock changes clear the partial gesture");
            state = Burst(1); state.Input(InputKind.Click, .5);
            Check(state.Mood(.6) != "belly", "Backward clock changes cannot leave belly permanently protected");
        }

        private static void RenderChecks(string root, string output, string breed)
        {
            using (var file = new Bitmap(Path.Combine(root, "local-assets", "site", "images", "art16-scenes-v1", breed, "idle.png")))
            {
                var descriptor = new DesktopAppearance { version = 1, key = "belly-check-" + breed, styleId = "art-16-scenes", breedId = breed, width = file.Width, height = file.Height, scenes = new Dictionary<string, DesktopAppearanceScene>() };
                var sheets = new Dictionary<string, Bitmap>();
                foreach (string scene in new[] { "idle", "side", "walk", "happy", "sleep" })
                {
                    descriptor.scenes.Add(scene, new DesktopAppearanceScene { frames = 1, frameMs = 125, sha256 = "same-original" });
                    sheets.Add(scene, DesktopAppearanceCache.DetachedRgba(file));
                }
                using (var frames = new DesktopAppearanceFrames(descriptor, sheets))
                {
                    byte[] source = Bytes(frames.Get("idle", 0, false).Image);
                    int originalOpaque = OpaqueCount(source);
                    foreach (double time in new[] { 0.0, .2, .8, 1.2, 2.2, 2.4 })
                    {
                        DesktopAppearanceFrame frame = frames.React("idle", "belly", null, time, true, false, 1, 1);
                        byte[] pixels = Bytes(frame.Image);
                        Check(frame.Image.Width == file.Width && frame.Image.Height == file.Height, breed + " belly keeps the native canvas at " + time);
                        Check(MaskMatches(frame, pixels), breed + " belly hit mask matches every rendered alpha pixel at " + time);
                        Check(OpaqueCount(pixels) > originalOpaque / 4, breed + " belly remains visible throughout its turn at " + time);
                        if (time == 0 || time == 2.4) Check(Equal(source, pixels), breed + " begins and finishes with exact original pixels at " + time);
                        if (time == .8) Check(!Equal(source, pixels), breed + " middle frame visibly turns belly-up");
                        if (breed == "pomeranian") frame.Image.Save(Path.Combine(output, "pomeranian-belly-" + time.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + ".png"), ImageFormat.Png);
                    }
                    Check(Equal(source, Bytes(frames.Get("idle", 0, false).Image)), breed + " rotation leaves source art immutable");
                    Check(frames.ReactionFrameCount <= 24 && frames.ReactionPixelCount <= 16L * 1024 * 1024, breed + " belly frame cache remains bounded");
                }
            }
        }

        private static int OpaqueCount(byte[] pixels) { int n = 0; for (int i = 3; i < pixels.Length; i += 4) if (pixels[i] > 0) n++; return n; }
        private static bool MaskMatches(DesktopAppearanceFrame frame, byte[] pixels)
        { if (frame.Opaque.Length * 4 != pixels.Length) return false; for (int i = 0; i < frame.Opaque.Length; i++) if (frame.Opaque[i] != (pixels[i * 4 + 3] > 0)) return false; return true; }
        private static bool Equal(byte[] a, byte[] b) { if (a.Length != b.Length) return false; for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false; return true; }
        private static byte[] Bytes(Bitmap bitmap)
        {
            var bytes = new byte[bitmap.Width * bitmap.Height * 4];
            BitmapData data = bitmap.LockBits(new Rectangle(Point.Empty, bitmap.Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try { for (int y = 0; y < bitmap.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), bytes, y * bitmap.Width * 4, bitmap.Width * 4); }
            finally { bitmap.UnlockBits(data); }
            return bytes;
        }
    }
}
