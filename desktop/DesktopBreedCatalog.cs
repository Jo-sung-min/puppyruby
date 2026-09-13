using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // Embedded from the same append-only catalog as the website at build time.
    internal static class DesktopBreedCatalog
    {
        internal static readonly string[] Ids;
        internal static readonly string[] Names;

        static DesktopBreedCatalog()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("breed-catalog.json"))
            {
                if (stream == null) throw new InvalidDataException("Missing puppy breed catalog.");
                using (StreamReader reader = new StreamReader(stream))
                {
                    var data = new JavaScriptSerializer().Deserialize<Catalog>(reader.ReadToEnd());
                    if (data == null || data.version != 1 || data.ids == null || data.names == null || data.ids.Length < 6 || data.ids.Length != data.names.Length)
                        throw new InvalidDataException("Invalid puppy breed catalog.");
                    var unique = new HashSet<string>(StringComparer.Ordinal);
                    for (int i = 0; i < data.ids.Length; i++)
                        if (String.IsNullOrWhiteSpace(data.ids[i]) || String.IsNullOrWhiteSpace(data.names[i]) || !unique.Add(data.ids[i]))
                            throw new InvalidDataException("Invalid puppy breed catalog entry.");
                    string[] legacy = { "pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle" };
                    for (int i = 0; i < legacy.Length; i++) if (data.ids[i] != legacy[i])
                        throw new InvalidDataException("Puppy breed indices must remain compatible.");
                    Ids = data.ids; Names = data.names;
                }
            }
        }

        public sealed class Catalog
        {
            public int version { get; set; }
            public string[] ids { get; set; }
            public string[] names { get; set; }
        }
    }
}
