using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace PuppyRubyDesktop
{
    // Keep ToolStrip's focus, keyboard navigation, screen-edge placement and
    // accessibility. Only its presentation changes.
    internal static class PetMenuTheme
    {
        private sealed class HeaderMarker { }
        private static readonly ConditionalWeakTable<ToolStripItem, HeaderMarker> Headers = new ConditionalWeakTable<ToolStripItem, HeaderMarker>();
        private static readonly ConditionalWeakTable<ContextMenuStrip, ThemeSession> Sessions = new ConditionalWeakTable<ContextMenuStrip, ThemeSession>();

        internal static void MarkHeader(ToolStripItem item)
        {
            if (item == null) return;
            Headers.GetValue(item, delegate { return new HeaderMarker(); });
            item.Enabled = false;
        }

        internal static void Apply(ContextMenuStrip menu)
        {
            if (menu == null) throw new ArgumentNullException("menu");
            // Respect Windows high-contrast colors and its native focus cues.
            if (SystemInformation.HighContrast) return;
            Sessions.GetValue(menu, delegate(ContextMenuStrip owner) { return new ThemeSession(owner); });
        }

        private static bool IsHeader(ToolStripItem item)
        {
            HeaderMarker marker;
            return Headers.TryGetValue(item, out marker);
        }

        private sealed class ThemeSession
        {
            private readonly List<ToolStripDropDown> styledMenus = new List<ToolStripDropDown>();
            private readonly Font menuFont;
            private readonly Font headerFont;
            private readonly DarkMenuRenderer renderer;
            private readonly float scale;
            private bool disposed;

            internal ThemeSession(ContextMenuStrip owner)
            {
                using (Graphics graphics = owner.CreateGraphics()) scale = graphics.DpiX / 96f;
                // Windows performs font fallback for Korean while preserving
                // the same quiet, compact proportions as other desktop menus.
                menuFont = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
                headerFont = new Font("Segoe UI", 8.25f, FontStyle.Regular, GraphicsUnit.Point);
                renderer = new DarkMenuRenderer(scale);
                StyleMenu(owner);
                owner.Disposed += delegate
                {
                    disposed = true;
                    menuFont.Dispose();
                    headerFont.Dispose();
                };
            }

            private int Px(float value) { return Math.Max(1, (int)Math.Round(value * scale)); }

            private void StyleMenu(ToolStripDropDown menu)
            {
                if (disposed || styledMenus.Contains(menu)) return;
                styledMenus.Add(menu);
                menu.Renderer = renderer;
                menu.BackColor = DarkMenuRenderer.Background;
                menu.ForeColor = DarkMenuRenderer.Foreground;
                menu.Font = menuFont;
                menu.Padding = new Padding(Px(5), Px(5), Px(5), Px(5));
                // DropDownMenu computes preferred width from text, even when
                // each item has AutoSize=false. Reserve the full custom gutter
                // and chevron area so short labels do not clip the right edge.
                menu.MinimumSize = new Size(Px(242), 0);
                menu.MaximumSize = new Size(Px(242), 0);
                menu.ShowItemToolTips = true;
                menu.DropShadowEnabled = true;
                ToolStripDropDownMenu dropDownMenu = menu as ToolStripDropDownMenu;
                if (dropDownMenu != null)
                {
                    // A single gutter is drawn ourselves; avoid the bright
                    // Windows image/check column and its duplicate check box.
                    dropDownMenu.ShowImageMargin = false;
                    dropDownMenu.ShowCheckMargin = false;
                }
                foreach (ToolStripItem item in menu.Items) StyleItem(item);
                menu.ItemAdded += delegate(object sender, ToolStripItemEventArgs args) { StyleItem(args.Item); };
                menu.SizeChanged += delegate { UpdateRegion(menu); };
                menu.Opening += delegate
                {
                    foreach (ToolStripItem item in menu.Items) StyleItem(item);
                    UpdateRegion(menu);
                };
                UpdateRegion(menu);
            }

            private void StyleItem(ToolStripItem item)
            {
                if (disposed) return;
                item.AutoSize = false;
                item.Size = new Size(Px(232), Px(item is ToolStripSeparator ? 9 : IsHeader(item) ? 25 : 27));
                item.Margin = Padding.Empty;
                item.Padding = Padding.Empty;
                item.Font = IsHeader(item) ? headerFont : menuFont;
                item.ForeColor = DarkMenuRenderer.Foreground;
                ToolStripMenuItem menuItem = item as ToolStripMenuItem;
                if (menuItem != null && menuItem.HasDropDownItems) StyleMenu(menuItem.DropDown);
            }

            private void UpdateRegion(ToolStripDropDown menu)
            {
                if (menu.Width < 2 || menu.Height < 2 || menu.IsDisposed) return;
                using (GraphicsPath path = DarkMenuRenderer.RoundedRectangle(new RectangleF(0, 0, menu.Width, menu.Height), Px(8)))
                {
                    Region previous = menu.Region;
                    menu.Region = new Region(path);
                    if (previous != null) previous.Dispose();
                }
            }
        }

        private sealed class DarkMenuRenderer : ToolStripRenderer
        {
            internal static readonly Color Background = Color.FromArgb(40, 42, 44);
            internal static readonly Color Foreground = Color.FromArgb(231, 233, 236);
            private static readonly Color Muted = Color.FromArgb(151, 156, 164);
            private static readonly Color Disabled = Color.FromArgb(112, 118, 127);
            private static readonly Color Border = Color.FromArgb(65, 68, 73);
            private static readonly Color Hover = Color.FromArgb(57, 60, 65);
            private readonly float scale;

            internal DarkMenuRenderer(float dpiScale) { scale = dpiScale; }
            private int Px(float value) { return Math.Max(1, (int)Math.Round(value * scale)); }

            internal static GraphicsPath RoundedRectangle(RectangleF rectangle, float radius)
            {
                float diameter = Math.Min(radius * 2, Math.Min(rectangle.Width, rectangle.Height));
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rectangle.Left, rectangle.Top, diameter, diameter, 180, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Top, diameter, diameter, 270, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(rectangle.Left, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure();
                return path;
            }

            protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
            {
                using (Brush brush = new SolidBrush(Background)) e.Graphics.FillRectangle(brush, e.AffectedBounds);
            }

            protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
            {
                SmoothingMode previous = e.Graphics.SmoothingMode;
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (GraphicsPath path = RoundedRectangle(new RectangleF(.5f, .5f, e.ToolStrip.Width - 1f, e.ToolStrip.Height - 1f), Px(8)))
                using (Pen pen = new Pen(Border, 1f)) e.Graphics.DrawPath(pen, path);
                e.Graphics.SmoothingMode = previous;
            }

            protected override void OnRenderImageMargin(ToolStripRenderEventArgs e) { }
            protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e) { }

            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                bool highlighted = e.Item.Enabled && (e.Item.Selected || e.Item.Pressed);
                if (highlighted)
                {
                    SmoothingMode previous = e.Graphics.SmoothingMode;
                    e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    using (GraphicsPath path = RoundedRectangle(new RectangleF(0, 0, e.Item.Width, e.Item.Height), Px(4)))
                    using (Brush brush = new SolidBrush(Hover)) e.Graphics.FillPath(brush, path);
                    e.Graphics.SmoothingMode = previous;
                }
                ToolStripMenuItem menuItem = e.Item as ToolStripMenuItem;
                if (menuItem == null || menuItem.CheckState == CheckState.Unchecked) return;
                float centerY = e.Item.Height / 2f;
                SmoothingMode smoothing = e.Graphics.SmoothingMode;
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (Pen pen = new Pen(e.Item.Enabled ? Foreground : Disabled, Math.Max(1.4f, 1.4f * scale)))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    pen.LineJoin = LineJoin.Round;
                    if (menuItem.CheckState == CheckState.Indeterminate)
                        e.Graphics.DrawLine(pen, Px(7), centerY, Px(15), centerY);
                    else
                        e.Graphics.DrawLines(pen, new PointF[] { new PointF(Px(7), centerY), new PointF(Px(10), centerY + Px(3)), new PointF(Px(16), centerY - Px(3)) });
                }
                e.Graphics.SmoothingMode = smoothing;
            }

            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                Color color = IsHeader(e.Item) ? Muted : e.Item.Enabled ? Foreground : Disabled;
                Rectangle bounds = new Rectangle(Px(25), 0, Math.Max(1, e.Item.Width - Px(48)), e.Item.Height);
                TextFormatFlags flags = TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding;
                if ((e.TextFormat & TextFormatFlags.HidePrefix) != 0) flags |= TextFormatFlags.HidePrefix;
                if ((e.TextFormat & TextFormatFlags.NoPrefix) != 0) flags |= TextFormatFlags.NoPrefix;
                TextRenderer.DrawText(e.Graphics, e.Text, e.TextFont, bounds, color, flags);
            }

            protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
            {
                SmoothingMode previous = e.Graphics.SmoothingMode;
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                float x = e.Item.Width - Px(13);
                float y = e.Item.Height / 2f;
                float direction = e.Direction == ArrowDirection.Left ? -1f : 1f;
                using (Pen pen = new Pen(e.Item.Enabled ? Muted : Disabled, Math.Max(1.1f, 1.1f * scale)))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    pen.LineJoin = LineJoin.Round;
                    if (e.Direction == ArrowDirection.Up || e.Direction == ArrowDirection.Down)
                    {
                        // ToolStrip adds these when a long submenu exceeds the
                        // work area. Keep native scrolling clear at high DPI.
                        x = e.ArrowRectangle.Left + e.ArrowRectangle.Width / 2f;
                        y = e.ArrowRectangle.Top + e.ArrowRectangle.Height / 2f;
                        direction = e.Direction == ArrowDirection.Up ? -1f : 1f;
                        e.Graphics.DrawLines(pen, new PointF[] { new PointF(x - Px(3), y - direction * Px(2)), new PointF(x, y + direction * Px(1)), new PointF(x + Px(3), y - direction * Px(2)) });
                    }
                    else
                        e.Graphics.DrawLines(pen, new PointF[] { new PointF(x - direction * Px(2), y - Px(3)), new PointF(x + direction * Px(1), y), new PointF(x - direction * Px(2), y + Px(3)) });
                }
                e.Graphics.SmoothingMode = previous;
            }

            protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
            {
                using (Pen pen = new Pen(Border, 1f)) e.Graphics.DrawLine(pen, Px(6), e.Item.Height / 2, e.Item.Width - Px(6), e.Item.Height / 2);
            }
        }
    }
}
