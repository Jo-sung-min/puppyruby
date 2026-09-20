using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class BundledRubyManifest
    {
        public int version { get; set; }
        public string styleId { get; set; }
        public string styleName { get; set; }
        public BundledRubyBreed[] breeds { get; set; }
    }

    internal sealed class BundledRubyBreed
    {
        public string breed { get; set; }
        public int width { get; set; }
        public int height { get; set; }
        public DesktopEyeAnchor[] reactionEyes { get; set; }
        public Dictionary<string, BundledRubyScene> scenes { get; set; }
        public Dictionary<string, BundledRubyScene> nativeActions { get; set; }
    }

    internal sealed class BundledRubyScene
    {
        public string resource { get; set; }
        public string sha256 { get; set; }
        public int frames { get; set; }
        public int frameMs { get; set; }
        public string bodyResource { get; set; }
        public string bodySha256 { get; set; }
        public int bodyFrames { get; set; }
        public string eyeResource { get; set; }
        public string eyeSha256 { get; set; }
        public string eyeStyle { get; set; }
        public DesktopEyeAnchor[][] eyeAnchors { get; set; }
        public string[] eyeModeByFrame { get; set; }
    }

    // The downloadable app always has one complete Ruby Dot release available.
    // A linked puppy can replace it only with another verified Ruby Dot descriptor.
    internal sealed class BundledRubyAppearanceLibrary : IDisposable
    {
        internal const string StyleId = "ruby-round-scenes";
        private static readonly string[] SceneNames = { "idle", "side", "walk", "happy", "sleep" };
        private readonly BundledRubyManifest manifest;
        private readonly Dictionary<string, BundledRubyBreed> breeds = new Dictionary<string, BundledRubyBreed>(StringComparer.Ordinal);
        private DesktopAppearanceFrames current;
        private string currentBreed;

        internal BundledRubyAppearanceLibrary()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ruby-default-manifest.json"))
            {
                if (stream == null) throw new InvalidDataException("루비 도트 기본 이미지를 찾지 못했어요.");
                using (var reader = new StreamReader(stream))
                    manifest = new JavaScriptSerializer().Deserialize<BundledRubyManifest>(reader.ReadToEnd());
            }
            if (manifest == null || manifest.version != 1 || manifest.styleId != StyleId || String.IsNullOrWhiteSpace(manifest.styleName)
                || manifest.breeds == null || manifest.breeds.Length != DesktopBreedCatalog.Ids.Length)
                throw new InvalidDataException("루비 도트 기본 이미지 목록을 확인하지 못했어요.");
            for (int index = 0; index < manifest.breeds.Length; index++)
            {
                BundledRubyBreed breed = manifest.breeds[index];
                if (breed == null || breed.breed != DesktopBreedCatalog.Ids[index] || breed.width < 1 || breed.width > 2048
                    || breed.height < 1 || breed.height > 2048 || breed.scenes == null || breed.scenes.Count != SceneNames.Length
                    || breed.reactionEyes == null || breed.reactionEyes.Length != 2 || breeds.ContainsKey(breed.breed))
                    throw new InvalidDataException("루비 도트 견종 목록을 확인하지 못했어요.");
                foreach (DesktopEyeAnchor eye in breed.reactionEyes)
                    if (eye == null || eye.x < 0 || eye.y < 0 || eye.width < 4 || eye.height < 4
                        || eye.x + eye.width > breed.width || eye.y + eye.height > breed.height)
                        throw new InvalidDataException("루비 도트 눈 위치를 확인하지 못했어요.");
                foreach (string name in SceneNames)
                {
                    BundledRubyScene scene;
                    if (!breed.scenes.TryGetValue(name, out scene) || scene == null || String.IsNullOrWhiteSpace(scene.resource)
                        || scene.frames < 1 || scene.frames > 8 || (name != "walk" && scene.frames != 1)
                        || scene.frameMs < 50 || scene.frameMs > 2000)
                        throw new InvalidDataException("루비 도트 장면 목록을 확인하지 못했어요.");
                }
                if (breed.nativeActions != null)
                {
                    if (breed.nativeActions.Count != DesktopAppearanceCache.NativeActions.Length) throw new InvalidDataException("루비 도트 추가 동작이 빠져 있어요.");
                    foreach (string name in DesktopAppearanceCache.NativeActions)
                        if (!breed.nativeActions.ContainsKey(name) || breed.nativeActions[name] == null) throw new InvalidDataException("루비 도트 추가 동작이 빠져 있어요.");
                    DesktopAppearanceCache.Validate(Descriptor(breed), "https://www.puppyruby.com");
                }
                breeds.Add(breed.breed, breed);
            }
        }

        internal int BreedCount { get { return breeds.Count; } }

        private static string ResourceUrl(string resource) { return "https://bundled.puppyruby.com/" + resource + ".png"; }

        private static DesktopAppearanceScene SceneDescriptor(BundledRubyScene scene)
        {
            var result = new DesktopAppearanceScene { url = ResourceUrl(scene.resource), sha256 = scene.sha256, frames = scene.frames, frameMs = scene.frameMs };
            if (scene.bodyResource != null)
            {
                result.bodyUrl = ResourceUrl(scene.bodyResource); result.bodySha256 = scene.bodySha256; result.bodyFrames = scene.bodyFrames;
                result.eyeUrl = ResourceUrl(scene.eyeResource); result.eyeSha256 = scene.eyeSha256; result.eyeStyle = scene.eyeStyle;
                result.eyeAnchors = scene.eyeAnchors; result.eyeModeByFrame = scene.eyeModeByFrame;
            }
            return result;
        }

        private DesktopAppearance Descriptor(BundledRubyBreed breed)
        {
            string key = DesktopAppearanceCache.Hash(System.Text.Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(breed)));
            var descriptor = new DesktopAppearance { version = 1, key = key, styleId = manifest.styleId, styleName = manifest.styleName,
                breedId = breed.breed, reactionEyes = breed.reactionEyes, width = breed.width, height = breed.height,
                scenes = new Dictionary<string, DesktopAppearanceScene>(StringComparer.Ordinal) };
            foreach (string name in SceneNames) descriptor.scenes.Add(name, SceneDescriptor(breed.scenes[name]));
            if (breed.nativeActions != null)
            {
                descriptor.nativeActions = new Dictionary<string, DesktopAppearanceScene>(StringComparer.Ordinal);
                foreach (string name in DesktopAppearanceCache.NativeActions) descriptor.nativeActions.Add(name, SceneDescriptor(breed.nativeActions[name]));
                descriptor.renderKey = key; descriptor.accessory = "none";
            }
            return descriptor;
        }

        private static Bitmap ReadImage(string resource, string sha256)
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            {
                if (stream == null) throw new InvalidDataException("루비 도트 이미지가 빠져 있어요: " + resource);
                using (var bytes = new MemoryStream())
                {
                    stream.CopyTo(bytes); byte[] data = bytes.ToArray();
                    if (sha256 != null && DesktopAppearanceCache.Hash(data) != sha256) throw new InvalidDataException("루비 도트 기본 이미지 해시가 맞지 않아요: " + resource);
                    using (var input = new MemoryStream(data)) using (var image = new Bitmap(input)) return DesktopAppearanceCache.DetachedRgba(image);
                }
            }
        }

        internal DesktopAppearanceFrames Get(string breedId)
        {
            BundledRubyBreed breed;
            if (!breeds.TryGetValue(breedId ?? "", out breed)) breed = breeds[DesktopBreedCatalog.Ids[0]];
            if (current != null && currentBreed == breed.breed) return current;

            var descriptor = Descriptor(breed);
            var sheets = new Dictionary<string, Bitmap>(StringComparer.Ordinal);
            try
            {
                foreach (string name in DesktopAppearanceCache.SceneNames(descriptor))
                {
                    BundledRubyScene scene = breed.scenes.ContainsKey(name) ? breed.scenes[name] : breed.nativeActions[name];
                    if (scene.bodyResource != null)
                    {
                        using (var body = ReadImage(scene.bodyResource, scene.bodySha256))
                        using (var eyes = ReadImage(scene.eyeResource, scene.eyeSha256))
                            sheets.Add(name, DesktopAppearanceFrames.ComposeEyes(body, eyes, breed.width, breed.height, scene.bodyFrames, scene.eyeAnchors));
                    }
                    else sheets.Add(name, ReadImage(scene.resource, scene.sha256));
                }
                DesktopAppearanceFrames next = new DesktopAppearanceFrames(descriptor, sheets);
                sheets = null;
                DesktopAppearanceFrames previous = current;
                current = next; currentBreed = breed.breed;
                if (previous != null) previous.Dispose();
                return current;
            }
            finally
            {
                if (sheets != null) foreach (Bitmap sheet in sheets.Values) sheet.Dispose();
            }
        }

        public void Dispose()
        {
            if (current != null) { current.Dispose(); current = null; }
            currentBreed = null;
        }
    }
}
