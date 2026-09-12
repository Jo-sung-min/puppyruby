$ErrorActionPreference = 'Stop'
$spriteRoot = $PSScriptRoot
$spriteBuild = Join-Path $spriteRoot 'build'
$spriteAssets = Join-Path $spriteBuild 'assets'
$spriteCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath (Join-Path $spriteAssets 'linked-sprites.json'))) { throw 'Run export-assets.cjs before verification.' }
$spriteTestSource = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Web.Script.Serialization;
namespace PuppyRubyDesktop {
    public sealed class LinkedSample {
        public string breed; public string mood; public int look; public int frame;
        public string fur; public string eyes; public string accessory; public string filename;
    }
    internal static class LinkedSpriteVerification {
        static int checkedPixels;
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
        static void Match(Bitmap actual, Bitmap expected, string label) {
            Check(actual.Width == 64 && actual.Height == 64, "Dimensions: " + label);
            for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++) {
                Check(actual.GetPixel(x, y).ToArgb() == expected.GetPixel(x, y).ToArgb(), "Pixel mismatch: " + label + " at " + x + "," + y);
                checkedPixels++;
            }
        }
        static int Main(string[] args) {
            try {
                var samples = new JavaScriptSerializer().Deserialize<List<LinkedSample>>(File.ReadAllText(Path.Combine(args[0], "samples.json")));
                using (var library = new LinkedSpriteLibrary()) {
                    foreach (var sample in samples) {
                        var actual = library.Get(sample.breed, sample.mood, sample.look, sample.frame, sample.fur, sample.eyes, sample.accessory);
                        using (var expected = new Bitmap(Path.Combine(args[0], sample.filename))) Match(actual, expected, sample.filename);
                        Check(Object.ReferenceEquals(actual, library.Get(sample.breed, sample.mood, sample.look, sample.frame, sample.fur, sample.eyes, sample.accessory)), "Composite is reused");
                    }
                    string[] web = { "pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle" };
                    for (int i = 0; i < web.Length; i++) Check(Object.ReferenceEquals(library.Get(i, "rose", "blue", "scarf", "idle", 0, 0), library.Get(web[i], "idle", 0, 0, "rose", "blue", "scarf")), "Web breed mapping");
                    Check(Object.ReferenceEquals(library.Get("../bad", null, 0, 0, "bad", null, "../bad"), library.Get("pomeranian", "idle", 0, 0, "original", "original", "none")), "Unknown values use safe defaults");
                    Check(Object.ReferenceEquals(library.Get(-1, "original", "original", "none", "idle", 0, 0), library.Get("pomeranian", "idle", 0, 0, "original", "original", "none")), "Unknown numeric breed uses web default");
                    Check(Object.ReferenceEquals(library.Get("shiba", "idle", 10, -1, "original", "original", "none"), library.Get("shiba", "idle", 1, 1, "original", "original", "none")), "Pose normalization");
                    foreach (string mood in new[] { "idle", "typing" }) foreach (string fur in new[] { "original", "cream", "chocolate", "rose", "silver" }) foreach (string eye in new[] { "original", "blue", "green", "amber" }) foreach (string accessory in new[] { "none", "ribbon", "scarf", "crown" }) library.Get("pomeranian", mood, 0, 0, fur, eye, accessory);
                    Check(library.CachedCompositeCount == LinkedSpriteLibrary.CompositeCapacity, "Composite cache is bounded");
                    var first = samples[0];
                    using (var expected = new Bitmap(Path.Combine(args[0], first.filename))) Match(library.Get(first.breed, first.mood, first.look, first.frame, first.fur, first.eyes, first.accessory), expected, "recreated after LRU eviction");
                    library.Dispose(); library.Dispose();
                    Check(library.CachedCompositeCount == 0, "Dispose clears cache");
                    bool rejected = false;
                    try { library.Get("shiba", "idle", 0, 0, "original", "original", "none"); } catch (ObjectDisposedException) { rejected = true; }
                    Check(rejected, "Disposed library rejects reads");
                }
                Console.WriteLine("PASS: " + samples.Count + " web-reference sprites, " + checkedPixels + " native pixel comparisons, six web breed mappings, fallback normalization and bounded LRU/disposal.");
                return 0;
            } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        }
    }
}
'@
$spriteSourcePath = Join-Path $spriteBuild 'LinkedSpriteVerification.cs'
$spriteTestExe = Join-Path $spriteBuild 'LinkedSpriteVerification.exe'
[IO.File]::WriteAllText($spriteSourcePath, $spriteTestSource, (New-Object Text.UTF8Encoding($true)))
$spriteArguments = @('/nologo', '/target:exe', '/optimize+', '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', ('/out:"' + $spriteTestExe + '"'))
Get-ChildItem -LiteralPath $spriteAssets -File | Where-Object { $_.Name -eq 'linked-sprites.json' -or $_.Name -match '^linked-[a-f0-9]{64}\.png$' } | Sort-Object Name | ForEach-Object {
    $spriteArguments += '/resource:"' + $_.FullName + '",' + $_.Name
}
$spriteArguments += '"' + (Join-Path $spriteRoot 'LinkedSpriteLibrary.cs') + '"'
$spriteArguments += '"' + $spriteSourcePath + '"'
$spriteResponse = Join-Path $spriteBuild 'verify-linked.rsp'
[IO.File]::WriteAllLines($spriteResponse, $spriteArguments, (New-Object Text.UTF8Encoding($true)))
& $spriteCompiler ('@' + $spriteResponse)
if ($LASTEXITCODE -ne 0) { throw 'Linked sprite verification compilation failed.' }
& $spriteTestExe (Join-Path $spriteBuild 'linked-verification')
if ($LASTEXITCODE -ne 0) { throw 'Linked sprite verification failed.' }
