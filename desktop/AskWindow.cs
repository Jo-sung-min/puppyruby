using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PuppyRubyDesktop
{
    internal sealed class CompanionView
    {
        internal string Name, Grade, Status, RewardNote, CareLabel;
        internal int Xp, PromotionCost;
        internal bool CanChange, CareReady;
        internal bool IsMax { get { return Grade == "SSR"; } }
        internal bool CanPromote { get { return CanChange && !IsMax && Xp >= PromotionCost; } }
        internal string Summary { get { return Grade + " 등급 · " + (IsMax ? Xp + " XP · 최고 등급" : Xp + " / " + PromotionCost + " XP"); } }
    }
    internal sealed class AskWindow : Form
    {
        private readonly CommandCatalog catalog;
        private readonly Func<CompanionView> view;
        private readonly Func<string, string, Task<CommandReply>> ask;
        private readonly Func<Task<string>> care;
        private readonly Func<Task<string>> promote;
        private readonly Label grade = new Label();
        private readonly Label connection = new Label();
        private readonly Label reward = new Label();
        private readonly ComboBox app = new ComboBox();
        private readonly TextBox query = new TextBox();
        private readonly TextBox answer = new TextBox();
        private readonly ListView commands = new ListView();
        private readonly Button promoteButton = new Button();
        private readonly Button careButton = new Button();
        private readonly Button submit = new Button();
        private bool working;
        private string listedGrade, listedApp;
        private static readonly string[] Apps = { "auto", "puppy", "excel", "hwp" };

        internal bool QueryHasFocus { get { return query.ContainsFocus; } }

        internal AskWindow(CommandCatalog commandCatalog, Func<CompanionView> companion,
            Func<string, string, Task<CommandReply>> onAsk, Func<Task<string>> onCare, Func<Task<string>> onPromote)
        {
            catalog = commandCatalog; view = companion; ask = onAsk; care = onCare; promote = onPromote;
            Text = "PuppyRuby · 강아지에게 물어보기";
            Font = new Font("Malgun Gothic", 10);
            BackColor = Color.FromArgb(255, 251, 241);
            ForeColor = Color.FromArgb(81, 64, 47);
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(740, 690); MinimumSize = new Size(650, 610);
            ShowInTaskbar = true;
            var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 9 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            float[] rows = { 38, 32, 40, 50, 115, 34, 38, 0, 43 };
            for (int i = 0; i < rows.Length; i++) root.RowStyles.Add(new RowStyle(i == 7 ? SizeType.Percent : SizeType.Absolute, i == 7 ? 100 : rows[i]));
            Controls.Add(root);

            grade.Dock = DockStyle.Fill; grade.Font = new Font(Font.FontFamily, 14, FontStyle.Bold);
            root.Controls.Add(grade, 0, 0);
            connection.Dock = DockStyle.Fill; root.Controls.Add(connection, 0, 1);

            var growth = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
            careButton.AutoSize = true; careButton.Height = 32;
            careButton.Click += async delegate { await RunAction(care); };
            promoteButton.AutoSize = true; promoteButton.Height = 32;
            promoteButton.Click += async delegate { await RunAction(promote); };
            growth.Controls.Add(careButton); growth.Controls.Add(promoteButton);
            reward.AutoSize = true; reward.Padding = new Padding(8, 8, 0, 0); reward.Font = new Font(Font.FontFamily, 8);
            growth.Controls.Add(reward);
            root.Controls.Add(growth, 0, 2);

            var entry = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1 };
            entry.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 107));
            entry.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            entry.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95));
            app.DropDownStyle = ComboBoxStyle.DropDownList; app.Dock = DockStyle.Fill;
            foreach (string id in Apps) app.Items.Add(CommandCatalog.AppName(id));
            app.SelectedIndex = 0;
            app.SelectedIndexChanged += delegate { RefreshCommands(); };
            query.Dock = DockStyle.Fill; query.MaxLength = 160;
            query.AccessibleName = "강아지에게 물어볼 명령";
            submit.Text = "물어보기"; submit.Dock = DockStyle.Top; submit.Height = 31;
            submit.Click += async delegate { await Submit(); };
            AcceptButton = submit;
            entry.Controls.Add(app, 0, 0); entry.Controls.Add(query, 1, 0); entry.Controls.Add(submit, 2, 0);
            root.Controls.Add(entry, 0, 3);

            answer.Multiline = true; answer.ReadOnly = true; answer.Dock = DockStyle.Fill;
            answer.BackColor = Color.White; answer.ScrollBars = ScrollBars.Vertical;
            answer.Text = "예: ‘엑셀 붙여넣기 단축키’, ‘앉아’\r\n궁금한 단축키나 훈련 명령을 위 칸에 입력해 줘.\r\n질문으로는 XP가 오르지 않아. 훈련 성공과 간식으로 성장해 멍!";
            answer.AccessibleName = "강아지 답변";
            root.Controls.Add(answer, 0, 4);
            root.Controls.Add(new Label { Text = "배울 수 있는 명령 · 두 번 클릭하면 수행하거나 답해 줘요", Dock = DockStyle.Fill, Padding = new Padding(0, 8, 0, 0) }, 0, 5);
            root.Controls.Add(new Label { Text = "N → R → SR → SSR · 100 XP마다 승급 · 잠긴 단축키는 승급 후 공개", Dock = DockStyle.Fill }, 0, 6);

            commands.Dock = DockStyle.Fill; commands.View = View.Details; commands.FullRowSelect = true;
            commands.MultiSelect = false; commands.HideSelection = false; commands.ShowItemToolTips = true;
            commands.Columns.Add("상태 / 등급", 112); commands.Columns.Add("분류", 72);
            commands.Columns.Add("명령", 205); commands.Columns.Add("단축키", 180);
            commands.DoubleClick += async delegate {
                if (commands.SelectedItems.Count == 0) return;
                PuppyCommand command = (PuppyCommand)commands.SelectedItems[0].Tag;
                query.Text = command.label;
                app.SelectedIndex = Array.IndexOf(Apps, command.app);
                await Submit();
            };
            root.Controls.Add(commands, 0, 7);
            root.Controls.Add(new Label { Text = "이 창에 쓴 질문은 저장하지 않아요. 다른 앱의 글자·키 이름은 읽지 않아요.", Dock = DockStyle.Fill, Padding = new Padding(0, 7, 0, 0) }, 0, 8);
            Shown += delegate { BeginInvoke(new Action(FocusQuestion)); };
            RefreshProgress();
        }

        internal void FocusQuestion() { Activate(); query.Select(); query.Focus(); }

        internal bool CheckExampleQuestion()
        {
            app.SelectedIndex = 2; query.Text = "붙여넣기 단축키 알려줘";
            ((Button)AcceptButton).PerformClick();
            return answer.Text.StartsWith("Ctrl + V다 멍!", StringComparison.Ordinal);
        }

        private async Task Submit()
        {
            if (working) return;
            working = true; RefreshProgress();
            try
            {
                CommandReply reply = await ask(query.Text, Apps[app.SelectedIndex]);
                if (IsDisposed) return;
                answer.Text = reply.Detail;
                if (reply.Status == "success" && reply.Command != null && !String.IsNullOrWhiteSpace(reply.Command.sourceUrl))
                    answer.Text += "\r\n공식 안내: " + reply.Command.sourceUrl;
            }
            catch (Exception error) { if (!IsDisposed) answer.Text = error.Message; }
            finally { working = false; if (!IsDisposed) RefreshProgress(); }
        }

        private async Task RunAction(Func<Task<string>> action)
        {
            if (working) return;
            working = true; RefreshProgress();
            try { string text = await action(); if (!IsDisposed) answer.Text = text; }
            catch (Exception error) { if (!IsDisposed) answer.Text = error.Message; }
            finally { working = false; if (!IsDisposed) RefreshProgress(); }
        }

        internal void RefreshProgress()
        {
            CompanionView current = view();
            grade.Text = current.Name + " · " + current.Summary;
            connection.Text = current.Status;
            reward.Text = current.RewardNote;
            careButton.Text = current.CareLabel;
            careButton.Enabled = !working && current.CanChange && current.CareReady;
            promoteButton.Text = current.IsMax ? "최고 등급 달성!" : "승급하기 · " + current.PromotionCost + " XP";
            promoteButton.Enabled = !working && current.CanPromote;
            submit.Enabled = !working; query.Enabled = !working; app.Enabled = !working; commands.Enabled = !working;
            RefreshCommands();
        }

        private void RefreshCommands()
        {
            if (app.SelectedIndex < 0) return;
            string selected = Apps[app.SelectedIndex];
            string currentGrade = view().Grade;
            if (listedGrade == currentGrade && listedApp == selected) return;
            listedGrade = currentGrade; listedApp = selected;
            commands.BeginUpdate(); commands.Items.Clear();
            foreach (PuppyCommand command in catalog.Commands)
            {
                if (selected != "auto" && command.app != selected) continue;
                bool unlocked = Progression.GradeIndex(currentGrade) >= Progression.GradeIndex(command.requiredGrade);
                var item = new ListViewItem((unlocked ? "배움 · " : "잠김 · ") + command.requiredGrade);
                item.SubItems.Add(CommandCatalog.AppName(command.app)); item.SubItems.Add(command.label);
                item.SubItems.Add(unlocked ? command.keys ?? "훈련하기" : command.requiredGrade + " 등급 필요");
                item.Tag = command;
                item.ToolTipText = unlocked ? command.context : command.requiredGrade + " 등급에 배울 수 있어 멍!";
                if (!unlocked) item.ForeColor = Color.FromArgb(145, 136, 123);
                commands.Items.Add(item);
            }
            commands.EndUpdate();
        }
    }
}
