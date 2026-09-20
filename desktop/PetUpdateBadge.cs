using System;
using System.Drawing;
using System.Windows.Forms;

namespace PuppyRubyDesktop
{
    // Independent from the pet's click-through surface so the update stays reachable.
    internal sealed class PetUpdateBadge : Form
    {
        private readonly Button action = new Button();
        private readonly ToolTip hint = new ToolTip();
        private string lastHint;
        internal event Action Requested;

        internal PetUpdateBadge()
        {
            Text = "PuppyRuby 업데이트";
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
            StartPosition = FormStartPosition.Manual; AutoScaleMode = AutoScaleMode.None;
            Size = new Size(146, 32); BackColor = Color.FromArgb(255, 249, 234);
            action.Dock = DockStyle.Fill; action.FlatStyle = FlatStyle.Flat;
            action.FlatAppearance.BorderColor = Color.FromArgb(225, 192, 136);
            action.FlatAppearance.MouseOverBackColor = Color.FromArgb(255, 237, 197);
            action.BackColor = BackColor; action.ForeColor = Color.FromArgb(93, 67, 38);
            action.Font = new Font("Malgun Gothic", 9, FontStyle.Bold);
            action.Text = "↓ 업데이트"; action.Cursor = Cursors.Hand;
            action.AccessibleName = "퍼피루비 업데이트 받기";
            action.Click += delegate { Action handler = Requested; if (handler != null) handler(); };
            Controls.Add(action);
        }

        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080; return cp; }
        }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x21) { message.Result = new IntPtr(3); return; }
            base.WndProc(ref message);
        }

        internal static Point Place(Rectangle pet, Size badge, Rectangle area)
        {
            int x = pet.Left + (pet.Width - badge.Width) / 2;
            int y = pet.Top - badge.Height - 4;
            // At the top edge keep the action in view next to the dog.
            if (y < area.Top + 4) { y = pet.Top; x = pet.Right + 4; }
            return new Point(Math.Max(area.Left + 4, Math.Min(x, area.Right - badge.Width - 4)),
                Math.Max(area.Top + 4, Math.Min(y, area.Bottom - badge.Height - 4)));
        }

        internal void RefreshStatus(string version, bool downloading, int percent, bool installing, string status)
        {
            string text = installing ? "설치 준비 중…" : downloading ? "다운로드 " + percent + "%" : "↓ 업데이트";
            if (action.Text != text) action.Text = text;
            action.Enabled = !downloading && !installing;
            action.AccessibleDescription = "새 버전 " + version + ". 기존 강아지와 연결 정보는 유지돼요.";
            string tooltip = downloading ? text : "새 버전 " + version + " · 눌러서 업데이트\n" + status;
            if (lastHint != tooltip) { hint.SetToolTip(action, tooltip); lastHint = tooltip; }
        }

        internal void Follow(Rectangle pet) { Location = Place(pet, Size, Screen.FromRectangle(pet).WorkingArea); }
        internal void PreparePreview()
        {
            IntPtr window = Handle;
            IntPtr button = action.Handle;
            PerformLayout();
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { hint.Dispose(); action.Font.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
