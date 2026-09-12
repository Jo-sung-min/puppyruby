using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // Composes the actual web sprite palette and accessories without storing every combination.
    // Returned images belong to this library and are borrowed for the current paint operation.
    internal sealed class LinkedSpriteLibrary : IDisposable
    {
        internal const int CompositeCapacity = 96;
        private const int RasterCapacity = 128;
        private const int Size = 64;
        private readonly object gate = new object();
        private readonly Dictionary<string, string> bodies;
        private readonly Dictionary<string, string> eyeLayers;
        private readonly Dictionary<string, string> accessoryLayers;
        private readonly Dictionary<string, LinkedListNode<Composite>> composites = new Dictionary<string, LinkedListNode<Composite>>(StringComparer.Ordinal);
        private readonly LinkedList<Composite> compositeLru = new LinkedList<Composite>();
        private readonly Dictionary<string, LinkedListNode<Raster>> rasters = new Dictionary<string, LinkedListNode<Raster>>(StringComparer.Ordinal);
        private readonly LinkedList<Raster> rasterLru = new LinkedList<Raster>();
        private bool disposed;
        private static readonly string[] WebBreeds = { "pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle" };
        private static readonly string[] Breeds = { "shiba", "samoyed", "poodle", "corgi", "maltese", "beagle", "pomeranian" };
        private static readonly string[] Moods = { "idle", "love", "eat", "play", "sleep", "typing", "excited", "scroll", "drag", "walk" };
        private static readonly string[] Furs = { "original", "cream", "chocolate", "rose", "silver" };
        private static readonly string[] Eyes = { "original", "blue", "green", "amber" };
        private static readonly string[] Accessories = { "none", "ribbon", "scarf", "crown" };

        private sealed class Composite
        {
            internal string Key;
            internal Bitmap Image;
        }
        private sealed class Raster
        {
            internal string Key;
            internal byte[] Pixels;
        }

        internal LinkedSpriteLibrary()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("linked-sprites.json"))
            {
                if (stream == null) throw new InvalidDataException("Missing linked puppy sprite catalog.");
                using (StreamReader reader = new StreamReader(stream))
                {
                    JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
                    var manifest = serializer.DeserializeObject(reader.ReadToEnd()) as Dictionary<string, object>;
                    if (manifest == null || Convert.ToInt32(manifest["version"]) != 1 || Convert.ToInt32(manifest["width"]) != Size || Convert.ToInt32(manifest["height"]) != Size)
                        throw new InvalidDataException("Unsupported linked puppy sprite catalog.");
                    bodies = ReadMap(manifest, "bodies");
                    eyeLayers = ReadMap(manifest, "eyeLayers");
                    accessoryLayers = ReadMap(manifest, "accessoryLayers");
                }
            }
        }

        private static Dictionary<string, string> ReadMap(Dictionary<string, object> manifest, string key)
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            var source = manifest[key] as Dictionary<string, object>;
            if (source == null) throw new InvalidDataException("Invalid linked puppy sprite map.");
            foreach (var item in source) result.Add(item.Key, item.Value == null ? null : Convert.ToString(item.Value));
            return result;
        }

        private static string Option(string value, string[] options, string fallback)
        {
            return value != null && Array.IndexOf(options, value) >= 0 ? value : fallback;
        }

        internal Bitmap Get(int breed, string fur, string eyes, string accessory, string mood, int look, int frame)
        {
            return Get(breed >= 0 && breed < WebBreeds.Length ? WebBreeds[breed] : "pomeranian", mood, look, frame, fur, eyes, accessory);
        }

        internal Bitmap Get(string breed, string mood, int look, int frame, string fur, string eyes, string accessory)
        {
            lock (gate)
            {
                if (disposed) throw new ObjectDisposedException("LinkedSpriteLibrary");
                breed = Option(breed, Breeds, "pomeranian"); mood = Option(mood, Moods, "idle");
                fur = Option(fur, Furs, "original"); eyes = Option(eyes, Eyes, "original"); accessory = Option(accessory, Accessories, "none");
                look = Math.Max(-1, Math.Min(1, look)); frame = ((frame % 2) + 2) % 2;
                string pose = mood + "|" + (look + 1) + "|" + frame;
                string key = breed + "|" + pose + "|" + fur + "|" + eyes + "|" + accessory;
                LinkedListNode<Composite> cached;
                if (composites.TryGetValue(key, out cached))
                {
                    compositeLru.Remove(cached); compositeLru.AddFirst(cached); return cached.Value.Image;
                }
                string bodyName, eyeName, accessoryName;
                if (!bodies.TryGetValue(breed + "|" + pose + "|" + fur, out bodyName) ||
                    !eyeLayers.TryGetValue(pose + "|" + eyes, out eyeName) || !accessoryLayers.TryGetValue(pose + "|" + accessory, out accessoryName))
                    throw new InvalidDataException("Incomplete linked puppy sprite catalog.");
                byte[] pixels = (byte[])ReadRaster(bodyName).Clone();
                Overlay(pixels, eyeName); Overlay(pixels, accessoryName);
                Bitmap image = new Bitmap(Size, Size, PixelFormat.Format32bppArgb);
                try
                {
                    BitmapData data = image.LockBits(new Rectangle(0, 0, Size, Size), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                    try { for (int row = 0; row < Size; row++) Marshal.Copy(pixels, row * Size * 4, IntPtr.Add(data.Scan0, row * data.Stride), Size * 4); }
                    finally { image.UnlockBits(data); }
                }
                catch { image.Dispose(); throw; }
                var entry = compositeLru.AddFirst(new Composite { Key = key, Image = image }); composites.Add(key, entry);
                if (composites.Count > CompositeCapacity)
                {
                    var oldest = compositeLru.Last; compositeLru.RemoveLast(); composites.Remove(oldest.Value.Key); oldest.Value.Image.Dispose();
                }
                return image;
            }
        }

        private void Overlay(byte[] destination, string name)
        {
            if (name == null) return;
            byte[] overlay = ReadRaster(name);
            for (int pixel = 0; pixel < destination.Length; pixel += 4)
            {
                if (overlay[pixel + 3] == 0) continue;
                if (overlay[pixel + 3] != 255) throw new InvalidDataException("Linked sprite overlays must be opaque pixel replacements.");
                Buffer.BlockCopy(overlay, pixel, destination, pixel, 4);
            }
        }

        private byte[] ReadRaster(string name)
        {
            LinkedListNode<Raster> cached;
            if (rasters.TryGetValue(name, out cached)) { rasterLru.Remove(cached); rasterLru.AddFirst(cached); return cached.Value.Pixels; }
            byte[] pixels = new byte[Size * Size * 4];
            // Resource names come only from the embedded catalog, never from server data or paths.
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (stream == null) throw new InvalidDataException("Missing linked puppy sprite: " + name);
                using (Bitmap source = new Bitmap(stream))
                {
                    if (source.Width != Size || source.Height != Size) throw new InvalidDataException("Invalid linked puppy sprite dimensions.");
                    BitmapData data = source.LockBits(new Rectangle(0, 0, Size, Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    try { for (int row = 0; row < Size; row++) Marshal.Copy(IntPtr.Add(data.Scan0, row * data.Stride), pixels, row * Size * 4, Size * 4); }
                    finally { source.UnlockBits(data); }
                }
            }
            var entry = rasterLru.AddFirst(new Raster { Key = name, Pixels = pixels }); rasters.Add(name, entry);
            if (rasters.Count > RasterCapacity) { var oldest = rasterLru.Last; rasterLru.RemoveLast(); rasters.Remove(oldest.Value.Key); }
            return pixels;
        }

        internal int CachedCompositeCount { get { lock (gate) { return composites.Count; } } }
        public void Dispose()
        {
            lock (gate)
            {
                if (disposed) return;
                disposed = true;
                foreach (Composite item in compositeLru) item.Image.Dispose();
                composites.Clear(); compositeLru.Clear(); rasters.Clear(); rasterLru.Clear();
            }
        }
    }
}
