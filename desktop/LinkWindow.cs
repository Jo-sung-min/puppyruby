using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PuppyRubyDesktop
{
    internal sealed class LinkWindow : Form
    {
        private readonly DesktopSync sync;
        private readonly TextBox site = new TextBox();
        private readonly TextBox code = new TextBox();
        private readonly TextBox label = new TextBox();
        private readonly Label status = new Label();
        private readonly TextBox result = new TextBox();
        private readonly Button pair = new Button();
        private readonly Button refresh = new Button();
        private readonly Button retry = new Button();
        private readonly Button disconnect = new Button();
        private bool working;

        internal LinkWindow(DesktopSync connection)
        {
            sync = connection;
            Text = "PuppyRuby · 웹 강아지와 연결";
            Font = new Font("Malgun Gothic", 10);
            BackColor = Color.FromArgb(255, 251, 241); ForeColor = Color.FromArgb(81, 64, 47);
            StartPosition = FormStartPosition.CenterScreen; Size = new Size(650, 610); MinimumSize = new Size(600, 580);
            var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 11 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            float[] heights = { 40, 57, 27, 36, 27, 36, 27, 38, 48, 0, 48 };
            for (int i = 0; i < heights.Length; i++) root.RowStyles.Add(new RowStyle(i == 9 ? SizeType.Percent : SizeType.Absolute, i == 9 ? 100 : heights[i]));
            Controls.Add(root);
            status.Dock = DockStyle.Fill; status.Font = new Font(Font.FontFamily, 13, FontStyle.Bold); root.Controls.Add(status, 0, 0);
            root.Controls.Add(new Label { Text = "사이트: ‘실행파일과 연결’ → ‘연결 코드 만들기’\r\n나온 12자리 코드를 입력하면 웹에서 키우던 강아지를 불러와요.", Dock = DockStyle.Fill }, 0, 1);
            root.Controls.Add(new Label { Text = "사이트 기본 주소", Dock = DockStyle.Fill }, 0, 2);
            site.Text = sync.Origin; site.Dock = DockStyle.Fill; site.MaxLength = 300; root.Controls.Add(site, 0, 3);
            root.Controls.Add(new Label { Text = "12자리 연결 코드 · 사이트에서 새로 발급", Dock = DockStyle.Fill }, 0, 4);
            code.Dock = DockStyle.Fill; code.MaxLength = 20; code.CharacterCasing = CharacterCasing.Upper; root.Controls.Add(code, 0, 5);
            root.Controls.Add(new Label { Text = "사이트에 표시할 기기 이름", Dock = DockStyle.Fill }, 0, 6);
            label.Text = "내 PC의 강아지"; label.Dock = DockStyle.Fill; label.MaxLength = 40; root.Controls.Add(label, 0, 7);
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
            pair.Text = "웹 강아지와 연결"; pair.AutoSize = true; pair.Height = 34;
            refresh.Text = "연결 다시 확인"; refresh.AutoSize = true; refresh.Height = 34;
            retry.Text = "이전 동작 결과 확인"; retry.AutoSize = true; retry.Height = 34;
            pair.Click += async delegate { await Run(async delegate { await sync.PairAsync(site.Text, code.Text, label.Text); code.Clear(); return sync.IsLinked ? "연결했어요! 사이트에서 선택한 강아지가 화면에 나타나요." : sync.Status; }); };
            refresh.Click += async delegate { await Run(async delegate { await sync.PollAsync(); return sync.Status; }); };
            retry.Click += async delegate { await Run(async delegate { DesktopActionResponse response = await sync.RetryPendingAsync(); return response.message; }); };
            actions.Controls.Add(pair); actions.Controls.Add(refresh); actions.Controls.Add(retry); root.Controls.Add(actions, 0, 8);
            result.Multiline = true; result.ReadOnly = true; result.ScrollBars = ScrollBars.Vertical; result.BackColor = Color.White; result.Dock = DockStyle.Fill;
            result.Text = "연결 중에는 웹의 규칙으로만 돌봄·훈련·승급해요.\r\n사이트가 꺼져 있으면 마지막 모습만 보여 주며 경험치는 오르지 않아요.\r\n연결을 해제하면 기존의 이 PC 강아지로 돌아와요. 서로의 경험치를 합치지 않아요.\r\n\r\n강아지 게임 정보만 연결해요. 사진·실명·친구·대화와 다른 앱 입력 내용은 가져오지 않아요.";
            root.Controls.Add(result, 0, 9);
            var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 9, 0, 0) };
            var close = new Button { Text = "닫기", AutoSize = true };
            close.Click += delegate { Close(); };
            disconnect.Text = "이 PC 연결 해제"; disconnect.AutoSize = true;
            disconnect.Click += delegate { sync.Disconnect("연결을 해제했어요. 이 PC의 강아지로 돌아왔어요."); result.Text = "이 PC에 저장한 연결 키를 지웠어요. 사이트의 연결 기기 목록에서도 기기를 삭제할 수 있어요."; RefreshStatus(); };
            footer.Controls.Add(close); footer.Controls.Add(disconnect); root.Controls.Add(footer, 0, 10);
            AcceptButton = pair;
            sync.Changed += RefreshStatus;
            FormClosed += delegate { sync.Changed -= RefreshStatus; code.Clear(); };
            RefreshStatus();
        }
        private async Task Run(Func<Task<string>> action)
        {
            if (working || sync.Busy) return;
            working = true; RefreshStatus();
            try { string text = await action(); if (!IsDisposed) result.Text = text; }
            catch (Exception error) { if (!IsDisposed) result.Text = error is TaskCanceledException ? "연결 시간이 길어지고 있어요. 사이트 주소와 실행 상태를 확인해 주세요." : error.Message; }
            finally { working = false; if (!IsDisposed) RefreshStatus(); }
        }
        internal void RefreshStatus()
        {
            if (IsDisposed) return;
            status.Text = sync.IsLinked ? (sync.Online ? "웹 강아지와 함께하는 중" : "마지막 웹 강아지를 보여 주는 중") : "웹 강아지와 연결하기";
            bool available = !working && !sync.Busy;
            pair.Enabled = available; site.Enabled = available; code.Enabled = available; label.Enabled = available;
            refresh.Enabled = available && sync.IsLinked; retry.Enabled = available && sync.IsLinked && sync.Online && sync.HasPending;
            disconnect.Enabled = available && sync.IsLinked;
        }
    }
}
