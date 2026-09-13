using System;
using System.Drawing.Imaging;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    // Explicit read-only diagnostic: never pairs/revokes a device or performs game actions.
    internal static class DesktopAppearanceDiagnostic
    {
        internal static int Run(string linkPath, string output)
        {
            try
            {
                Task.Run(async delegate
                {
                    using (var sync = new DesktopSync(linkPath, true))
                    using (var cache = new DesktopAppearanceCache(Path.Combine(Path.GetDirectoryName(output), "readonly-image-cache")))
                    {
                        if (!sync.IsLinked) throw new InvalidDataException("저장된 강아지 연결이 없어요.");
                        if (!await sync.PollAsync()) throw new InvalidDataException(sync.Status);
                        if (sync.State.appearance == null) throw new InvalidDataException(sync.State.appearanceError ?? "이 스타일은 PC 기본 그림을 사용해요.");
                        await cache.UpdateAsync(sync.State.appearance, sync.Origin);
                        if (cache.Current == null || cache.Current.Key != sync.State.appearance.key) throw new InvalidDataException(cache.Status);
                        string preview = Path.ChangeExtension(output, ".png");
                        cache.Current.Get("idle", 0, false).Image.Save(preview, ImageFormat.Png);
                        var report = new { linked = sync.IsLinked, online = sync.Online, style = cache.Current.StyleId,
                            breed = cache.Current.BreedId, width = cache.Current.Width, height = cache.Current.Height,
                            key = cache.Current.Key, walkFrames = sync.State.appearance.scenes["walk"].frames,
                            cachedFrames = cache.Current.CachedFrameCount, preview = preview, gameActions = 0 };
                        File.WriteAllText(output, new JavaScriptSerializer().Serialize(report));
                    }
                }).GetAwaiter().GetResult();
                return 0;
            }
            catch (Exception error)
            {
                File.WriteAllText(output, new JavaScriptSerializer().Serialize(new { verified = false, error = error.GetType().Name, message = error.Message }));
                return 1;
            }
        }
    }
}
