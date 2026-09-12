using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace PuppyRubyDesktop
{
    // A separate, temporary window keeps the pet's own surface image-only.
    internal sealed class PetBubble : Form
    {
        private readonly Font captionFont = new Font("Malgun Gothic", 9, FontStyle.Regular);
        private string caption = "";
        internal string Caption { get { return caption; } }
        internal PetBubble()
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
            StartPosition = FormStartPosition.Manual; AutoScaleMode = AutoScaleMode.None;
            BackColor = Color.Magenta; TransparencyKey = Color.Magenta; DoubleBuffered = true;
        }
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080 | 0x20; return cp; }
        }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x21) { message.Result = new IntPtr(3); return; }
            if (message.Msg == 0x84) { message.Result = new IntPtr(-1); return; }
            base.WndProc(ref message);
        }
        internal static string ShortText(string text)
        {
            string compact = Regex.Replace(text ?? "", @"\s+", " ").Trim();
            return compact.Length > 66 ? compact.Substring(0, 65).TrimEnd() + "…" : compact;
        }
        internal void Say(string text, Rectangle pet)
        {
            caption = ShortText(text);
            if (caption.Length == 0) { Hide(); return; }
            Size measured = TextRenderer.MeasureText(caption, captionFont, new Size(214, 44), TextFormatFlags.WordBreak | TextFormatFlags.NoPadding);
            Size = new Size(Math.Max(72, Math.Min(238, measured.Width + 24)), Math.Max(34, Math.Min(62, measured.Height + 18)));
            Follow(pet); if (!Visible) Show(); Invalidate();
        }
        internal static Point Place(Rectangle pet, Size bubble, Rectangle area)
        {
            int x = pet.Left + (pet.Width - bubble.Width) / 2;
            int y = pet.Top - bubble.Height + 6;
            if (y < area.Top + 4) y = pet.Bottom - 3;
            return new Point(Math.Max(area.Left + 4, Math.Min(x, area.Right - bubble.Width - 4)),
                Math.Max(area.Top + 4, Math.Min(y, area.Bottom - bubble.Height - 4)));
        }
        internal void Follow(Rectangle pet) { Location = Place(pet, Size, Screen.FromRectangle(pet).WorkingArea); }
        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(BackColor);
            // Integer raster edges avoid colored fringes with the transparency key.
            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = new GraphicsPath())
            {
                const int radius = 14;
                path.AddArc(bounds.Left, bounds.Top, radius, radius, 180, 90);
                path.AddArc(bounds.Right - radius, bounds.Top, radius, radius, 270, 90);
                path.AddArc(bounds.Right - radius, bounds.Bottom - radius, radius, radius, 0, 90);
                path.AddArc(bounds.Left, bounds.Bottom - radius, radius, radius, 90, 90); path.CloseFigure();
                using (Brush fill = new SolidBrush(Color.FromArgb(255, 253, 248))) e.Graphics.FillPath(fill, path);
                using (Pen line = new Pen(Color.FromArgb(220, 210, 194))) e.Graphics.DrawPath(line, path);
            }
            TextRenderer.DrawText(e.Graphics, caption, captionFont, new Rectangle(10, 7, Width - 20, Height - 14),
                Color.FromArgb(98, 80, 62), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
        }
        protected override void Dispose(bool disposing) { if (disposing) captionFont.Dispose(); base.Dispose(disposing); }
    }
}
