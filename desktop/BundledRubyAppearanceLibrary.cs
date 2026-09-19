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
    }

    internal sealed class BundledRubyScene
    {
        public string resource { get; set; }
        public int frames { get; set; }
        public int frameMs { get; set; }
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
                breeds.Add(breed.breed, breed);
            }
        }

        internal int BreedCount { get { return breeds.Count; } }

        internal DesktopAppearanceFrames Get(string breedId)
        {
            BundledRubyBreed breed;
            if (!breeds.TryGetValue(breedId ?? "", out breed)) breed = breeds[DesktopBreedCatalog.Ids[0]];
            if (current != null && currentBreed == breed.breed) return current;

            var descriptor = new DesktopAppearance
            {
                version = 1,
                key = "bundled-ruby-round-v1:" + breed.breed,
                styleId = manifest.styleId,
                styleName = manifest.styleName,
                breedId = breed.breed,
                reactionEyes = breed.reactionEyes,
                width = breed.width,
                height = breed.height,
                scenes = new Dictionary<string, DesktopAppearanceScene>(StringComparer.Ordinal)
            };
            var sheets = new Dictionary<string, Bitmap>(StringComparer.Ordinal);
            try
            {
                foreach (string name in SceneNames)
                {
                    BundledRubyScene scene = breed.scenes[name];
                    descriptor.scenes.Add(name, new DesktopAppearanceScene { frames = scene.frames, frameMs = scene.frameMs });
                    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(scene.resource))
                    {
                        if (stream == null) throw new InvalidDataException("루비 도트 이미지가 빠져 있어요: " + breed.breed + "/" + name);
                        using (var source = new Bitmap(stream)) sheets.Add(name, DesktopAppearanceCache.DetachedRgba(source));
                    }
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
