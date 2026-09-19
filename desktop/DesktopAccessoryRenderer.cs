using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace PuppyRubyDesktop
{
    // Ruby accessories are drawn from the same finite IDs used by the web closet.
    // They stay vector-free at runtime: every primitive snaps to the native pixel
    // grid before the completed sheet is split into cached animation frames.
    internal static class DesktopAccessoryRenderer
    {
        private static readonly HashSet<string> Supported = new HashSet<string>(new[]
        {
            "none", "ribbon", "scarf", "crown", "bow-blue", "bow-lilac",
            "party-hat", "flower", "glasses", "halo", "angel-wings"
        }, StringComparer.Ordinal);

        internal static bool IsSupported(string value)
        {
            return String.IsNullOrEmpty(value) || Supported.Contains(value);
        }

        internal static void Draw(Bitmap sheet, int frameWidth, int frameHeight, int frames, DesktopEyeAnchor[][] anchors, string accessory)
        {
            accessory = String.IsNullOrEmpty(accessory) ? "none" : accessory;
            if (!Supported.Contains(accessory)) throw new InvalidDataException("강아지 액세서리 정보를 확인하지 못했어요.");
            if (accessory == "none") return;
            if (sheet == null || sheet.Width != frameWidth * frames || sheet.Height != frameHeight || anchors == null || anchors.Length != frames)
                throw new InvalidDataException("강아지 액세서리 위치를 확인하지 못했어요.");

            double scaleX = frameWidth / 64.0, scaleY = frameHeight / 64.0;
            using (Graphics graphics = Graphics.FromImage(sheet))
            {
                graphics.CompositingMode = CompositingMode.SourceOver;
                graphics.SmoothingMode = SmoothingMode.None;
                graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = PixelOffsetMode.Half;
                for (int frame = 0; frame < frames; frame++)
                {
                    DesktopEyeAnchor[] eyes = anchors[frame];
                    if (eyes == null || eyes.Length < 1) throw new InvalidDataException("강아지 액세서리 위치를 확인하지 못했어요.");
                    double centerX = 0, centerY = 0;
                    foreach (DesktopEyeAnchor eye in eyes)
                    {
                        centerX += eye.x + eye.width / 2.0;
                        centerY += eye.y + eye.height / 2.0;
                    }
                    centerX = centerX / eyes.Length / frameWidth * 64;
                    centerY = centerY / eyes.Length / frameHeight * 64;
                    int offset = frame * frameWidth;
                    graphics.SetClip(new Rectangle(offset, 0, frameWidth, frameHeight), CombineMode.Replace);
                    if (accessory == "glasses") DrawGlasses(graphics, offset, eyes);
                    else if (accessory == "scarf") DrawScarf(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else if (accessory == "crown") DrawCrown(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else if (accessory == "party-hat") DrawPartyHat(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else if (accessory == "flower") DrawFlower(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else if (accessory == "halo") DrawHalo(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else if (accessory == "angel-wings") DrawWings(graphics, offset, scaleX, scaleY, centerX, centerY);
                    else DrawBow(graphics, offset, scaleX, scaleY, centerX, centerY, accessory);
                }
                graphics.ResetClip();
            }
        }

        private static int Px(int offset, double value, double scale) { return offset + (int)Math.Round(value * scale); }
        private static int Py(double value, double scale) { return (int)Math.Round(value * scale); }
        private static int Span(double value, double scale) { return Math.Max(1, (int)Math.Round(value * scale)); }
        private static Rectangle Box(int offset, double scaleX, double scaleY, double x, double y, double width, double height)
        {
            return new Rectangle(Px(offset, x, scaleX), Py(y, scaleY), Span(width, scaleX), Span(height, scaleY));
        }
        private static Point Dot(int offset, double scaleX, double scaleY, double x, double y)
        {
            return new Point(Px(offset, x, scaleX), Py(y, scaleY));
        }
        private static void Fill(Graphics graphics, string color, Rectangle rectangle)
        {
            using (var brush = new SolidBrush(ColorTranslator.FromHtml(color))) graphics.FillRectangle(brush, rectangle);
        }
        private static void Polygon(Graphics graphics, string color, params Point[] points)
        {
            using (var brush = new SolidBrush(ColorTranslator.FromHtml(color))) graphics.FillPolygon(brush, points);
        }

        private static void DrawBow(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY, string id)
        {
            double x = Math.Min(51, centerX + 15) - 4, y = Math.Max(3, centerY - 18) + 3;
            string dark = id == "bow-blue" ? "#385477" : id == "bow-lilac" ? "#604777" : "#863a52";
            string main = id == "bow-blue" ? "#6badd4" : id == "bow-lilac" ? "#ad86c8" : "#d8708a";
            string light = id == "bow-blue" ? "#b1e1ee" : id == "bow-lilac" ? "#dfc5ed" : "#f7b4c0";
            Fill(graphics, dark, Box(offset, scaleX, scaleY, x, y + 1, 4, 6));
            Fill(graphics, dark, Box(offset, scaleX, scaleY, x + 7, y + 1, 4, 6));
            Fill(graphics, main, Box(offset, scaleX, scaleY, x + 1, y + 2, 3, 4));
            Fill(graphics, main, Box(offset, scaleX, scaleY, x + 7, y + 2, 3, 4));
            Fill(graphics, dark, Box(offset, scaleX, scaleY, x + 4, y + 2, 3, 4));
            Fill(graphics, light, Box(offset, scaleX, scaleY, x + 2, y + 2, 2, 1));
            Fill(graphics, light, Box(offset, scaleX, scaleY, x + 8, y + 2, 2, 1));
        }

        private static void DrawScarf(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            double x = centerX - 10, y = centerY + 11;
            Fill(graphics, "#8d4954", Box(offset, scaleX, scaleY, x, y, 20, 4));
            Fill(graphics, "#8d4954", Box(offset, scaleX, scaleY, x + 14, y + 3, 5, 9));
            Fill(graphics, "#da8390", Box(offset, scaleX, scaleY, x + 1, y + 1, 18, 2));
            Fill(graphics, "#da8390", Box(offset, scaleX, scaleY, x + 15, y + 3, 3, 8));
            Fill(graphics, "#f5bdbe", Box(offset, scaleX, scaleY, x + 3, y + 1, 4, 1));
        }

        private static void DrawCrown(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            double x = centerX - 8, y = Math.Max(0, centerY - 23);
            Polygon(graphics, "#856037", Dot(offset, scaleX, scaleY, x, y), Dot(offset, scaleX, scaleY, x + 3, y + 4),
                Dot(offset, scaleX, scaleY, x + 7, y), Dot(offset, scaleX, scaleY, x + 10, y + 4),
                Dot(offset, scaleX, scaleY, x + 14, y), Dot(offset, scaleX, scaleY, x + 17, y + 9), Dot(offset, scaleX, scaleY, x, y + 9));
            Fill(graphics, "#e6b954", Box(offset, scaleX, scaleY, x + 1, y + 4, 15, 5));
            Fill(graphics, "#ffe69b", Box(offset, scaleX, scaleY, x + 1, y + 7, 15, 1));
            Fill(graphics, "#ba6b87", Box(offset, scaleX, scaleY, x + 4, y + 6, 2, 2));
            Fill(graphics, "#6babb1", Box(offset, scaleX, scaleY, x + 11, y + 6, 2, 2));
        }

        private static void DrawPartyHat(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            double x = centerX - 6, y = Math.Max(0, centerY - 26);
            Polygon(graphics, "#604f79", Dot(offset, scaleX, scaleY, x + 6, y), Dot(offset, scaleX, scaleY, x, y + 13), Dot(offset, scaleX, scaleY, x + 13, y + 13));
            Polygon(graphics, "#ab95ca", Dot(offset, scaleX, scaleY, x + 6, y + 2), Dot(offset, scaleX, scaleY, x + 2, y + 11), Dot(offset, scaleX, scaleY, x + 11, y + 11));
            Fill(graphics, "#e7bf72", Box(offset, scaleX, scaleY, x + 2, y + 8, 9, 2));
            Fill(graphics, "#e7bf72", Box(offset, scaleX, scaleY, x, y + 12, 13, 2));
            Fill(graphics, "#fff2c5", Box(offset, scaleX, scaleY, x + 5, y, 3, 2));
        }

        private static void DrawFlower(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            double x = Math.Min(51, centerX + 15), y = Math.Max(3, centerY - 18) + 5;
            Fill(graphics, "#eeabb5", Box(offset, scaleX, scaleY, x - 2, y - 5, 4, 10));
            Fill(graphics, "#eeabb5", Box(offset, scaleX, scaleY, x - 5, y - 2, 10, 4));
            Fill(graphics, "#eac260", Box(offset, scaleX, scaleY, x - 2, y - 2, 4, 4));
            Fill(graphics, "#7d9971", Box(offset, scaleX, scaleY, x + 2, y + 4, 4, 2));
        }

        private static void DrawGlasses(Graphics graphics, int offset, DesktopEyeAnchor[] eyes)
        {
            int thickness = Math.Max(1, eyes[0].width / 5);
            using (var pen = new Pen(Color.FromArgb(255, 57, 52, 58), thickness))
            {
                Rectangle first = Rectangle.Empty, previous = Rectangle.Empty;
                foreach (DesktopEyeAnchor eye in eyes)
                {
                    int padding = Math.Max(2, Math.Min(eye.width, eye.height) / 3);
                    var lens = new Rectangle(offset + eye.x - padding, eye.y - padding, eye.width + padding * 2, eye.height + padding * 2);
                    graphics.DrawRectangle(pen, lens);
                    if (first == Rectangle.Empty) first = lens;
                    if (previous != Rectangle.Empty) graphics.DrawLine(pen, previous.Right, previous.Top + previous.Height / 2, lens.Left, lens.Top + lens.Height / 2);
                    previous = lens;
                }
            }
        }

        private static void DrawHalo(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            Rectangle outer = Box(offset, scaleX, scaleY, centerX - 10, Math.Max(1, centerY - 23), 20, 6);
            int width = Math.Max(1, Span(1, Math.Min(scaleX, scaleY)));
            using (var dark = new Pen(Color.FromArgb(255, 199, 148, 52), width * 2)) graphics.DrawEllipse(dark, outer);
            outer.Inflate(-width, -width);
            using (var light = new Pen(Color.FromArgb(255, 251, 228, 155), width)) graphics.DrawEllipse(light, outer);
        }

        private static void DrawWings(Graphics graphics, int offset, double scaleX, double scaleY, double centerX, double centerY)
        {
            Polygon(graphics, "#a6b6d1", Dot(offset, scaleX, scaleY, centerX - 13, centerY + 10), Dot(offset, scaleX, scaleY, centerX - 27, centerY + 1),
                Dot(offset, scaleX, scaleY, centerX - 30, centerY + 17), Dot(offset, scaleX, scaleY, centerX - 24, centerY + 25), Dot(offset, scaleX, scaleY, centerX - 12, centerY + 28));
            Polygon(graphics, "#f3f6ff", Dot(offset, scaleX, scaleY, centerX - 14, centerY + 13), Dot(offset, scaleX, scaleY, centerX - 27, centerY + 6),
                Dot(offset, scaleX, scaleY, centerX - 26, centerY + 17), Dot(offset, scaleX, scaleY, centerX - 21, centerY + 23), Dot(offset, scaleX, scaleY, centerX - 12, centerY + 25));
            Polygon(graphics, "#a6b6d1", Dot(offset, scaleX, scaleY, centerX + 13, centerY + 10), Dot(offset, scaleX, scaleY, centerX + 27, centerY + 1),
                Dot(offset, scaleX, scaleY, centerX + 30, centerY + 17), Dot(offset, scaleX, scaleY, centerX + 24, centerY + 25), Dot(offset, scaleX, scaleY, centerX + 12, centerY + 28));
            Polygon(graphics, "#f3f6ff", Dot(offset, scaleX, scaleY, centerX + 14, centerY + 13), Dot(offset, scaleX, scaleY, centerX + 27, centerY + 6),
                Dot(offset, scaleX, scaleY, centerX + 26, centerY + 17), Dot(offset, scaleX, scaleY, centerX + 21, centerY + 23), Dot(offset, scaleX, scaleY, centerX + 12, centerY + 25));
        }
    }
}
