using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("PuppyRuby")]
[assembly: AssemblyDescription("A little pixel puppy for your Windows desktop")]
[assembly: AssemblyProduct("PuppyRuby")]
[assembly: AssemblyVersion("0.9.0.0")]

namespace PuppyRubyDesktop
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Native.SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 2 && args[0] == "--self-test") return SelfTest.Run(args[1]);
            if (args.Length == 2 && args[0] == "--sync-test") return SyncTest.Run(args[1]);
            if (args.Length == 3 && args[0] == "--appearance-render-test") return DesktopAppearanceFramesTest.RealFiles(args[1], args[2]);
            if (args.Length == 3 && args[0] == "--verify-linked-appearance") return DesktopAppearanceDiagnostic.Run(args[1], args[2]);
            bool motionSmoke = args.Length == 2 && args[0] == "--motion-test";
            bool smoke = motionSmoke || (args.Length == 2 && args[0] == "--smoke-test");
            bool first;
            using (Mutex singleton = new Mutex(true, "Local\\PuppyRuby.Desktop", out first))
            {
                if (!first && !smoke)
                {
                    Native.PostMessage(new IntPtr(0xffff), Native.RestoreMessage, IntPtr.Zero, IntPtr.Zero);
                    return 0;
                }
                try
                {
                    using (PetWindow pet = new PetWindow(smoke))
                    {
                        if (smoke)
                        {
                            var timer = new System.Windows.Forms.Timer { Interval = 1800 };
                            Point starting = Point.Empty, stopped = Point.Empty; bool moved = false; int phase = 0;
                            timer.Tick += delegate {
                                if (motionSmoke)
                                {
                                    if (phase++ == 0) { moved = pet.Location != starting; pet.StopMotionCheck(); stopped = pet.Location; timer.Interval = 700; return; }
                                    if (phase == 2) { pet.CapturePresentation(Path.GetDirectoryName(args[1])); timer.Interval = 4000; return; }
                                    timer.Stop();
                                    bool stayed = pet.Location == stopped;
                                    File.WriteAllText(args[1], "window=" + pet.IsHandleCreated + "\nfollowMoved=" + moved + "\nstopStayed=" + stayed + "\nbubbleExpired=" + !pet.BubbleVisible + "\nnoFocus=" + !pet.ContainsFocus + "\ntransparent=" + (pet.TransparencyKey == pet.BackColor) + "\nhooks=" + pet.HooksActive + "\n");
                                    if (!moved || !stayed || pet.BubbleVisible) pet.StartupFailed = true;
                                    pet.Close(); timer.Dispose(); return;
                                }
                                timer.Stop();
                                bool questionFocus = pet.QuestionHasFocus;
                                bool questionReply = pet.CheckQuestionReply();
                                pet.CaptureQuestionWindow(Path.ChangeExtension(args[1], ".png"));
                                pet.CaptureLinkWindow(Path.Combine(Path.GetDirectoryName(args[1]), "link-window.png"));
                                File.WriteAllText(args[1], "window=" + pet.IsHandleCreated + "\nhooks=" + pet.HooksActive + "\ntransparent=" + (pet.TransparencyKey == pet.BackColor) + "\ntopmost=" + pet.TopMost + "\nquestionFocus=" + questionFocus + "\nquestionReply=" + questionReply + "\n");
                                pet.Close(); timer.Dispose();
                            };
                            pet.Shown += delegate { if (motionSmoke) starting = pet.BeginMotionCheck(); else pet.BeginInvoke(new Action(pet.OpenQuestions)); timer.Start(); };
                        }
                        Application.Run(pet);
                        return pet.StartupFailed ? 1 : 0;
                    }
                }
                catch (Exception error)
                {
                    if (smoke) File.WriteAllText(args[1], "ERROR: " + error.Message);
                    else MessageBox.Show("강아지를 불러오지 못했어요.\n" + error.Message, "PuppyRuby", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 1;
                }
                finally { if (first) singleton.ReleaseMutex(); }
            }
        }
    }

    internal static class Native
    {
        internal static readonly uint RestoreMessage = RegisterWindowMessage("PuppyRuby.RestorePet");
        [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string message);
        [DllImport("user32.dll")] internal static extern int GetWindowLong(IntPtr window, int index);
        [DllImport("user32.dll")] internal static extern int SetWindowLong(IntPtr window, int index, int value);
    }

    internal static class DesktopResources
    {
        internal static Icon LoadIcon()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("puppy.ico"))
            {
                if (stream == null) throw new InvalidDataException("루비 도트 아이콘을 찾지 못했어요.");
                using (Icon source = new Icon(stream)) return (Icon)source.Clone();
            }
        }
    }

    internal sealed class PetWindow : Form
    {
        private static readonly string[] BreedIds = DesktopBreedCatalog.Ids;
        private static readonly string[] BreedNames = DesktopBreedCatalog.Names;
        private readonly PetState state = new PetState();
        private readonly Progression progress = new Progression();
        private readonly CommandCatalog catalog = CommandCatalog.Load();
        private readonly NativeInput input = new NativeInput();
        private readonly BundledRubyAppearanceLibrary bundledRuby = new BundledRubyAppearanceLibrary();
        private readonly PetMotion motion = new PetMotion();
        private readonly PetBubble bubble = new PetBubble();
        private readonly DesktopSync sync;
        private readonly DesktopAppearanceCache appearanceCache;
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly System.Windows.Forms.Timer animation = new System.Windows.Forms.Timer { Interval = 40 };
        private readonly System.Windows.Forms.Timer syncTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        private readonly System.Windows.Forms.Timer statusTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        private readonly ContextMenuStrip menu = new ContextMenuStrip();
        private readonly NotifyIcon tray = new NotifyIcon();
        private readonly bool transient;
        private readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PuppyRuby", "desktop.settings");
        private ToolStripMenuItem pauseItem;
        private ToolStripMenuItem clickThroughItem;
        private ToolStripMenuItem gradeItem;
        private ToolStripMenuItem breedMenu;
        private ToolStripMenuItem linkedStatus;
        private ToolStripMenuItem disconnectMenu;
        private ToolStripMenuItem careMenu;
        private ToolStripMenuItem restMenu;
        private ToolStripMenuItem appearanceStatus;
        private ToolStripMenuItem followItem;
        private ToolStripMenuItem stayItem;
        private AskWindow questions;
        private LinkWindow linkWindow;
        private double spokenUntil;
        private double lastAnimation;
        private bool followMouse = true;
        private Rectangle[] workingAreas;
        private Rectangle paintedTarget;
        private Bitmap paintedSource;
        private bool[] paintedMask;
        private int paintedWidth, paintedHeight;
        private DesktopAppearanceFrame renderingFrame;
        private double restingUntil;
        private double feedingUntil;
        private double sceneStarted;
        private string activeScene;
        private string activeReaction;
        private int sceneDirection = -1;
        private Point previousCursor;
        private Point pressCursor;
        private Point pressWindow;
        private bool pressed;
        private bool dragging;
        private bool clickThrough;
        private bool showHints = true;
        private int scale = 3;
        private string breed = "pomeranian";
        private int look;
        private int lookY;
        private double lastPet;
        internal bool StartupFailed;
        internal bool HooksActive { get { return input.Active; } }
        internal bool BubbleVisible { get { return !bubble.IsDisposed && bubble.Visible; } }
        internal bool QuestionHasFocus { get { return questions != null && questions.QueryHasFocus; } }
        internal bool CheckQuestionReply() { return questions != null && questions.CheckExampleQuestion(); }
        internal void CaptureQuestionWindow(string path)
        {
            if (questions == null) return;
            using (Bitmap image = new Bitmap(questions.Width, questions.Height))
            { questions.DrawToBitmap(image, new Rectangle(Point.Empty, image.Size)); image.Save(path, ImageFormat.Png); }
        }
        internal void CaptureLinkWindow(string path)
        {
            OpenLink();
            using (Bitmap image = new Bitmap(linkWindow.Width, linkWindow.Height))
            { linkWindow.DrawToBitmap(image, new Rectangle(Point.Empty, image.Size)); image.Save(path, ImageFormat.Png); }
        }
        internal Point BeginMotionCheck()
        {
            Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
            bool cursorOnLeft = Cursor.Position.X < area.Left + area.Width / 2;
            Location = new Point(cursorOnLeft ? area.Right - Width - 10 : area.Left + 10, area.Top + 40);
            motion.SetPosition(Location); SetFollow(true); return Location;
        }
        internal void StopMotionCheck() { stayItem.PerformClick(); }
        internal void CapturePresentation(string directory)
        {
            bubble.Hide();
            using (var image = new Bitmap(Width, Height))
            {
                DrawToBitmap(image, new Rectangle(Point.Empty, Size)); image.MakeTransparent(BackColor);
                image.Save(Path.Combine(directory, "pet-only.png"), ImageFormat.Png);
            }
            Speak("Ctrl + V다 멍!");
            using (var image = new Bitmap(bubble.Width, bubble.Height))
            {
                bubble.DrawToBitmap(image, new Rectangle(Point.Empty, bubble.Size)); image.MakeTransparent(bubble.BackColor);
                image.Save(Path.Combine(directory, "simple-bubble.png"), ImageFormat.Png);
            }
        }

        internal void CheckPresentation(Action<bool, string> check)
        {
            state.SetEnabled(false, Now);
            for (int size = 2; size <= 4; size++)
            {
                scale = size; ApplySize();
                using (var image = new Bitmap(Width, Height))
                {
                    DrawToBitmap(image, new Rectangle(Point.Empty, Size));
                    bool onlyDog = true;
                    for (int y = 0; y < Height; y++) for (int x = 0; x < Width; x++)
                        if (!paintedTarget.Contains(x, y) && image.GetPixel(x, y).ToArgb() != BackColor.ToArgb()) onlyDog = false;
                    check(onlyDog && !bubble.Visible, "pet-only surface has no idle bubble or footer at scale " + size);
                }
                check(!HitRenderedPet(new Point(0, 0)), "transparent margin cannot start dragging at scale " + size);
                Point foot = new Point(paintedTarget.X + paintedTarget.Width / 2, paintedTarget.Y + paintedTarget.Height * 3 / 4);
                bool foundFoot = false;
                for (int y = paintedHeight - 1; y >= paintedHeight / 2 && !foundFoot; y--)
                    for (int x = paintedWidth / 5; x < paintedWidth * 4 / 5; x++)
                        if (paintedMask[y * paintedWidth + x])
                        {
                            foot = new Point(paintedTarget.X + x * paintedTarget.Width / paintedWidth,
                                paintedTarget.Y + y * paintedTarget.Height / paintedHeight);
                            foundFoot = true; break;
                        }
                check(foundFoot, "Ruby Dot has an interactive lower-body pixel at scale " + size);
                check(HitRenderedPet(foot), "painted paw is interactive at scale " + size);
                state.SetEnabled(true, Now); OnInput(InputKind.Click);
                OnMouseDown(new MouseEventArgs(MouseButtons.Left, 1, foot.X, foot.Y, 0));
                check(pressed, "global click jump does not invalidate painted paw hit at scale " + size);
                dragging = true;
                OnMouseUp(new MouseEventArgs(MouseButtons.Left, 1, foot.X, foot.Y, 0));
                check(!followMouse && !pressed && !dragging && !motion.IsMoving, "manual drop stops following and clears capture at scale " + size);
                state.SetEnabled(false, Now);
            }
            state.Train("puppy-paw", Now); Rectangle trainedTarget; Bitmap trained = RenderSprite(out trainedTarget);
            check(trained != null && renderingFrame != null && CurrentAppearance.StyleId == BundledRubyAppearanceLibrary.StyleId,
                "explicit training keeps the bundled Ruby Dot appearance while global input is paused");
            followItem.PerformClick(); check(followMouse && followItem.Checked && !stayItem.Checked, "follow menu resumes and updates selection");
            stayItem.PerformClick(); check(!followMouse && !followItem.Checked && stayItem.Checked, "stop menu updates selection immediately");
        }

        internal PetWindow(bool isTransient)
        {
            transient = isTransient;
            sync = new DesktopSync(transient ? null : Path.Combine(Path.GetDirectoryName(settingsPath), "desktop.link"), !transient);
            appearanceCache = new DesktopAppearanceCache(transient ? null : Path.Combine(Path.GetDirectoryName(settingsPath), "appearance-cache"));
            Text = "PuppyRuby · 내 화면의 작은 강아지";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
            DoubleBuffered = true;
            AutoScaleMode = AutoScaleMode.None;
            StartPosition = FormStartPosition.Manual;
            Icon = DesktopResources.LoadIcon();
            if (!transient) LoadSettings();
            ApplySize();
            if (Location == Point.Empty) PutAtCorner(); else KeepOnScreen();
            motion.SetPosition(Location);
            RefreshScreens();
            previousCursor = Cursor.Position;
            BuildMenu();
            sync.Changed += OnSyncChanged;
            appearanceCache.Changed += OnAppearanceChanged;
            tray.Icon = Icon;
            tray.Text = "PuppyRuby · 우클릭으로 설정 / 종료";
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { RestorePet(); };
            tray.Visible = !transient;
            input.Activity += OnInput;
            animation.Tick += delegate { Animate(); };
            syncTimer.Tick += async delegate { if (sync.IsLinked) await sync.PollAsync(); };
            statusTimer.Tick += delegate { UpdateProgress(); };
            Shown += async delegate {
                try { input.Start(); animation.Start(); }
                catch (Exception) {
                    StartupFailed = true;
                    state.SetEnabled(false, Now); pauseItem.Checked = true;
                    if (!transient) MessageBox.Show("입력 반응을 시작하지 못했어요. 트레이 메뉴에서 ‘입력 반응 일시정지’를 해제해 다시 시도해 주세요.", "PuppyRuby");
                    animation.Start();
                }
                statusTimer.Start(); syncTimer.Start();
                await RefreshAppearance();
                if (sync.IsLinked) await sync.PollAsync();
            };
            UpdateProgress();
            SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
        }

        private double Now { get { return clock.Elapsed.TotalSeconds; } }
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080; return cp; }
        }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x21) { message.Result = new IntPtr(3); return; }
            if ((uint)message.Msg == Native.RestoreMessage) { RestorePet(); return; }
            base.WndProc(ref message);
        }

        private void OnInput(InputKind kind)
        {
            double now = Now;
            bool wasBelly = state.Mood(now) == "belly";
            if (state.Enabled && kind != InputKind.Move) { restingUntil = 0; feedingUntil = 0; }
            state.Input(kind, now);
            if (!wasBelly && state.Mood(now) == "belly")
            {
                motion.SetPosition(Location);
                Speak("발라당! 배도 쓰다듬어 줘 ♡", PetState.BellyDurationSeconds);
            }
        }
        private void Animate()
        {
            double now = Now;
            Point cursor = Cursor.Position;
            bool interacting = pressed || dragging || menu.Visible || (questions != null && !questions.IsDisposed && questions.Visible && questions.WindowState != FormWindowState.Minimized) || (linkWindow != null && !linkWindow.IsDisposed && linkWindow.Visible && linkWindow.WindowState != FormWindowState.Minimized);
            string inputMood = state.Mood(now);
            bool activeInputReaction = inputMood == "typing" || inputMood == "excited" || inputMood == "play" || inputMood == "scroll" || inputMood == "love" || inputMood == "drag" || inputMood == "belly";
            bool following = followMouse && state.Enabled && Visible && !interacting && !activeInputReaction && state.Training(now) == null && now >= restingUntil && now >= feedingUntil;
            Point next = motion.Step(cursor, Size, workingAreas, now - lastAnimation, following);
            lastAnimation = now;
            if (following && Location != next) Location = next;
            if (state.Enabled)
            {
                if (cursor != previousCursor)
                {
                    state.Input(InputKind.Move, Now);
                    Point local = PointToClient(cursor);
                    Rectangle target = paintedTarget;
                    Rectangle head = new Rectangle(target.X + target.Width * 10 / 64, target.Y, target.Width * 44 / 64, target.Height * 44 / 64);
                    if (head.Contains(local) && HitRenderedPet(local) && !pressed && Now - lastPet > .4)
                    {
                        state.Input(InputKind.Pet, Now); lastPet = Now;
                    }
                }
                int delta = cursor.X - (Left + Width / 2);
                look = delta < -45 ? -1 : delta > 45 ? 1 : 0;
                int verticalDelta = cursor.Y - (Top + 24 + (Height - 48) * 46 / 100);
                lookY = verticalDelta < -35 ? -1 : verticalDelta > 35 ? 1 : 0;
            }
            else { look = 0; lookY = 0; }
            previousCursor = cursor;
            if (bubble.Visible)
            {
                if (!Visible || !showHints || now >= spokenUntil) bubble.Hide();
                else { Rectangle target; RenderSprite(out target); bubble.Follow(RectangleToScreen(target)); }
            }
            if (Visible) Invalidate();
        }

        internal static void DrawPet(Graphics graphics, Bitmap sprite, Rectangle target)
        {
            if (sprite == null) return;
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
            graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.DrawImage(sprite, target, 0, 0, sprite.Width, sprite.Height, GraphicsUnit.Pixel);
        }

        private Bitmap RenderSprite(out Rectangle target)
        {
            string mood = state.Mood(Now);
            string training = state.Training(Now);
            renderingFrame = null;
            DesktopAppearanceFrames appearance = CurrentAppearance;
            if (appearance != null)
            {
                if (mood != "belly" && Now < feedingUntil && training == null && state.Enabled) mood = "eat";
                string scene = DesktopAppearanceFrames.SelectScene(mood, training, motion.IsMoving, Now < restingUntil, state.Enabled);
                string reaction = training ?? mood;
                if (activeScene != scene || activeReaction != reaction) { activeScene = scene; activeReaction = reaction; sceneStarted = Now; }
                if (scene == "walk" && motion.DirectionX != 0) sceneDirection = motion.DirectionX;
                if (scene == "side" && look != 0) sceneDirection = look;
                bool flip = (scene == "walk" || scene == "side") && sceneDirection > 0;
                double reactionElapsed = mood == "belly" ? Now - state.BellyStartedAt : Now - sceneStarted;
                renderingFrame = appearance.React(scene, mood, training, reactionElapsed, state.Enabled, flip, look, lookY);
                Size display = DesktopAppearanceFrames.DisplaySize(appearance.Width, appearance.Height, scale);
                target = new Rectangle(8, 24, display.Width, display.Height);
                double elapsed = Now - sceneStarted;
                if (state.Enabled || training != null)
                {
                    if (training == "puppy-turn")
                    {
                        int narrow = Math.Max(8, (int)(target.Width * Math.Abs(Math.Cos(elapsed * 5))));
                        target.X += (target.Width - narrow) / 2; target.Width = narrow;
                    }
                    else if (training == "puppy-paw") { target.X += (int)(Math.Sin(elapsed * 9) * 2); target.Y -= 2; }
                    else if (training == null && scene != "sleep")
                    {
                        if (mood == "play") target.Y -= (int)(Math.Abs(Math.Sin(elapsed * 12)) * 19);
                        else if (mood == "scroll") { target.X += (int)(Math.Sin(elapsed * 13) * 3); target.Y += (int)(Math.Sin(elapsed * 16) * 4); }
                        else if (mood == "drag") { target.X += (int)(Math.Sin(elapsed * 12) * 4); target.Y -= 12; }
                        else if (mood == "excited") target.Y -= (int)(elapsed * 13) % 2 == 0 ? 3 : 0;
                    }
                }
                return renderingFrame.Image;
            }
            throw new InvalidOperationException("루비 도트 기본 이미지를 불러오지 못했어요.");
        }

        internal static bool IsOpaque(Bitmap sprite, Rectangle target, Point point)
        {
            if (!target.Contains(point) || target.Width <= 0 || target.Height <= 0) return false;
            int x = (point.X - target.X) * sprite.Width / target.Width;
            int y = (point.Y - target.Y) * sprite.Height / target.Height;
            return sprite.GetPixel(x, y).A > 0;
        }

        private bool HitRenderedPet(Point point)
        {
            if (paintedMask == null || paintedWidth < 1 || paintedHeight < 1 || !paintedTarget.Contains(point)) return false;
            int x = (point.X - paintedTarget.X) * paintedWidth / paintedTarget.Width;
            int y = (point.Y - paintedTarget.Y) * paintedHeight / paintedTarget.Height;
            return paintedMask[y * paintedWidth + x];
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(BackColor);
            Rectangle target; Bitmap sprite = RenderSprite(out target);
            DrawPet(e.Graphics, sprite, target);
            paintedTarget = target;
            if (sprite == null)
            {
                paintedMask = null; paintedSource = null; paintedWidth = paintedHeight = 0;
            }
            else if (renderingFrame != null)
            {
                paintedMask = renderingFrame.Opaque;
                paintedSource = sprite; paintedWidth = sprite.Width; paintedHeight = sprite.Height;
            }
            else if (paintedSource != sprite)
            {
                paintedWidth = sprite.Width; paintedHeight = sprite.Height;
                paintedMask = new bool[paintedWidth * paintedHeight];
                for (int y = 0; y < paintedHeight; y++) for (int x = 0; x < paintedWidth; x++) paintedMask[y * paintedWidth + x] = sprite.GetPixel(x, y).A > 0;
                paintedSource = sprite;
            }
            base.OnPaint(e);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                // Global click hooks may already have selected a jump reaction.
                // Use the visible frame, not the upcoming pose, to begin a drag.
                if (!HitRenderedPet(e.Location)) return;
                pressed = true; dragging = false; pressCursor = Cursor.Position;
                pressWindow = Location; Capture = true;
                motion.SetPosition(Location);
                if (state.Mood(Now) != "belly") bubble.Hide();
            }
            base.OnMouseDown(e);
        }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (pressed)
            {
                Point cursor = Cursor.Position;
                int dx = cursor.X - pressCursor.X, dy = cursor.Y - pressCursor.Y;
                if (Math.Abs(dx) + Math.Abs(dy) > 5) dragging = true;
                if (dragging)
                {
                    state.Input(InputKind.Drag, Now);
                    Location = new Point(pressWindow.X + dx, pressWindow.Y + dy);
                    motion.SetPosition(Location);
                }
            }
            base.OnMouseMove(e);
        }
        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right) { motion.SetPosition(Location); bubble.Hide(); menu.Show(this, e.Location); }
            else if (e.Button == MouseButtons.Left && pressed)
            {
                bool moved = dragging;
                state.Input(moved ? InputKind.Drop : InputKind.Pet, Now);
                pressed = false; dragging = false; Capture = false;
                if (moved) SetFollow(false);
                else if (state.Mood(Now) != "belly") Speak("좋아 멍!", 2.0);
                KeepOnScreen(); SaveSettings();
            }
            base.OnMouseUp(e);
        }
        protected override void OnMouseCaptureChanged(EventArgs e)
        {
            if (!Capture && pressed)
            {
                bool moved = dragging;
                pressed = false; dragging = false; state.Input(InputKind.Drop, Now); KeepOnScreen();
                if (moved) SetFollow(false);
            }
            base.OnMouseCaptureChanged(e);
        }

        private void BuildMenu()
        {
            menu.Items.Add("PuppyRuby · 내 화면의 작은 친구").Enabled = false;
            followItem = new ToolStripMenuItem("마우스 따라가기") { Checked = followMouse };
            stayItem = new ToolStripMenuItem("여기에 멈추기") { Checked = !followMouse };
            followItem.Click += delegate { SetFollow(true); Speak("같이 가자 멍!", 2); };
            stayItem.Click += delegate { SetFollow(false); Speak("여기서 기다릴게 멍!", 2); };
            menu.Items.Add(followItem); menu.Items.Add(stayItem); menu.Items.Add(new ToolStripSeparator());
            gradeItem = new ToolStripMenuItem(progress.Summary) { Enabled = false };
            menu.Items.Add(gradeItem);
            menu.Items.Add("강아지에게 물어보기 / 배운 명령", null, delegate { OpenQuestions(); });
            careMenu = new ToolStripMenuItem("간식 주기 · 경험치 +10", null, async delegate { try { await GiveCare(); } catch (Exception error) { Speak(error.Message); } }); menu.Items.Add(careMenu);
            restMenu = new ToolStripMenuItem("쉬게 하기", null, async delegate { try { await Rest(); } catch (Exception error) { Speak(error.Message); } }); menu.Items.Add(restMenu);
            menu.Items.Add("웹 강아지와 연결", null, delegate { OpenLink(); });
            linkedStatus = new ToolStripMenuItem("연결 상태", null, delegate { OpenLink(); }); menu.Items.Add(linkedStatus);
            appearanceStatus = new ToolStripMenuItem("강아지 모습", null, delegate { OpenLink(); }); menu.Items.Add(appearanceStatus);
            disconnectMenu = new ToolStripMenuItem("연결 해제", null, delegate { sync.Disconnect("이 PC의 강아지로 돌아왔어요. 기존 경험치는 그대로예요."); }); menu.Items.Add(disconnectMenu);
            menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem breeds = new ToolStripMenuItem("강아지 고르기");
            breedMenu = breeds;
            for (int i = 0; i < BreedIds.Length; i++)
            {
                string id = BreedIds[i];
                ToolStripMenuItem item = new ToolStripMenuItem(BreedNames[i]) { Checked = breed == id };
                item.Click += delegate {
                    breed = id;
                    foreach (ToolStripMenuItem sibling in breeds.DropDownItems) sibling.Checked = sibling == item;
                    state.Input(InputKind.Pet, Now); OnAppearanceChanged(); SaveSettings();
                };
                breeds.DropDownItems.Add(item);
            }
            menu.Items.Add(breeds);
            ToolStripMenuItem sizes = new ToolStripMenuItem("강아지 크기");
            for (int value = 2; value <= 4; value++)
            {
                int size = value;
                ToolStripMenuItem item = new ToolStripMenuItem(size == 2 ? "작게" : size == 3 ? "보통" : "크게") { Checked = scale == size };
                item.Click += delegate {
                    scale = size;
                    foreach (ToolStripMenuItem sibling in sizes.DropDownItems) sibling.Checked = sibling == item;
                    ApplySize(); KeepOnScreen(); SaveSettings();
                };
                sizes.DropDownItems.Add(item);
            }
            menu.Items.Add(sizes);
            pauseItem = new ToolStripMenuItem("입력 반응 일시정지") { CheckOnClick = true };
            pauseItem.Click += delegate {
                motion.SetPosition(Location); bubble.Hide(); restingUntil = 0; feedingUntil = 0; activeScene = null; activeReaction = null; look = 0; lookY = 0;
                if (pauseItem.Checked) { input.Stop(); state.SetEnabled(false, Now); }
                else
                {
                    try { input.Start(); state.SetEnabled(true, Now); }
                    catch { pauseItem.Checked = true; state.SetEnabled(false, Now); tray.ShowBalloonTip(3000, "PuppyRuby", "입력 반응을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", ToolTipIcon.Info); }
                }
            };
            menu.Items.Add(pauseItem);
            clickThroughItem = new ToolStripMenuItem("마우스 통과") { CheckOnClick = true };
            clickThroughItem.Click += delegate {
                clickThrough = clickThroughItem.Checked;
                int style = Native.GetWindowLong(Handle, -20);
                Native.SetWindowLong(Handle, -20, clickThrough ? style | 0x20 : style & ~0x20);
                Invalidate();
                if (clickThrough) tray.ShowBalloonTip(2500, "PuppyRuby", "트레이의 강아지 아이콘을 우클릭하면 마우스 통과를 해제할 수 있어요.", ToolTipIcon.Info);
            };
            menu.Items.Add(clickThroughItem);
            ToolStripMenuItem hints = new ToolStripMenuItem("짧은 말풍선 표시") { CheckOnClick = true, Checked = showHints };
            hints.Click += delegate { showHints = hints.Checked; if (!showHints) bubble.Hide(); SaveSettings(); };
            menu.Items.Add(hints);
            menu.Items.Add("화면 오른쪽 아래로", null, delegate { RestorePet(); });
            ToolStripMenuItem hide = new ToolStripMenuItem("강아지 숨기기");
            hide.Click += delegate { if (Visible) { Hide(); hide.Text = "강아지 보이기"; } else { Show(); hide.Text = "강아지 숨기기"; } };
            menu.Items.Add(hide);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("사용 방법 / 입력 안내", null, delegate {
                MessageBox.Show("마우스 따라가기: 커서 옆으로 걸어와요\n여기에 멈추기: 현재 위치에 머물러요\n드래그로 옮기면 그 자리에 멈춰요\n평소에는 강아지만 보이고 대답은 잠깐 나타나요\n마우스 이동: 눈으로 따라봐요\n클릭: 폴짝 뛰어요\n키보드: 앞발로 타이핑해요\n빠른 타이핑: 신나게 바빠져요\n스크롤: 데굴데굴 반응해요\n강아지 위 마우스: 쓰다듬어요\n드래그: 원하는 위치로 옮겨요\n웹 도트: 입력이 없으면 정면으로 앉아요\n쉬게 하기: 준비된 잠자기 장면으로 쉬어요\n기본 PC 강아지: 45초 동안 입력이 없으면 잠들어요\n\n우클릭 → ‘강아지에게 물어보기’에서 엑셀·한글 단축키와 훈련을 요청해요. 훈련 성공·간식은 10초마다 +10 XP, 100 XP로 승급해요. 질문·전역 입력은 XP를 올리지 않아요. 웹 강아지와 연결하면 사이트에서 선택한 강아지와 경험치를 공유해요. 웹 연결 중 훈련은 5초마다, 간식은 30초마다 할 수 있어요. 오프라인에서는 연결된 강아지의 경험치를 바꾸지 않아요. 연결하지 않은 PC 강아지는 따로 자라요.\n\n다른 앱의 문자·키 이름·입력 내용은 읽거나 저장하지 않아요. 질문 창에 직접 쓴 글자만 답변에 사용하며 저장하지 않아요. 웹 연결을 켠 동안 지정한 사이트로 강아지 게임 정보만 요청해요. 사진·실명·친구·채팅은 가져오지 않아요. 자동 시작은 없어요. ‘입력 반응 일시정지’는 입력 감지도 중지해요.", "PuppyRuby 사용 방법", MessageBoxButtons.OK, MessageBoxIcon.Information);
            });
            menu.Items.Add("종료", null, delegate { Close(); });
        }

        internal void OpenQuestions()
        {
            if (questions == null || questions.IsDisposed)
            {
                // This normal window intentionally accepts typing. The pet keeps
                // WS_EX_NOACTIVATE and global hooks still receive event categories only.
                questions = new AskWindow(catalog, CurrentCompanion, Ask, GiveCare, Promote);
                questions.Icon = Icon;
                questions.Show();
            }
            else { questions.WindowState = FormWindowState.Normal; questions.Show(); questions.FocusQuestion(); }
        }

        private void SetFollow(bool enabled)
        {
            followMouse = enabled; motion.SetPosition(Location);
            if (!enabled && CurrentAppearance != null) { state.SetEnabled(state.Enabled, Now); restingUntil = 0; feedingUntil = 0; activeScene = null; activeReaction = null; Invalidate(); }
            if (followItem != null) followItem.Checked = enabled;
            if (stayItem != null) stayItem.Checked = !enabled;
            SaveSettings();
        }

        private void Speak(string text, double seconds = 3.5)
        {
            if (IsDisposed || Disposing || bubble.IsDisposed) return;
            spokenUntil = Now + seconds;
            if (!showHints || !Visible) { bubble.Hide(); return; }
            Rectangle target; RenderSprite(out target);
            bubble.Say(text, RectangleToScreen(target));
        }

        private void OpenLink()
        {
            if (linkWindow == null || linkWindow.IsDisposed) { linkWindow = new LinkWindow(sync, appearanceCache); linkWindow.Icon = Icon; linkWindow.Show(); }
            else { linkWindow.WindowState = FormWindowState.Normal; linkWindow.Show(); linkWindow.Activate(); }
        }

        private CompanionView CurrentCompanion()
        {
            if (!sync.IsLinked || sync.State == null) return new CompanionView { Name = "이 PC의 강아지", Grade = progress.Grade, Xp = progress.Xp, PromotionCost = Progression.PromotionCost, CanChange = true, CareReady = true, CareLabel = "간식 주기 +10 XP", Status = sync.Status, RewardNote = "이 PC 보상 · 훈련·간식 10초마다" };
            SyncedPuppy dog = sync.State.puppy;
            long now = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
            int wait = Math.Max(0, (int)Math.Ceiling((dog.lastFeed + 30000 - now) / 1000.0));
            return new CompanionView { Name = dog.name, Grade = dog.grade, Xp = dog.xp, PromotionCost = sync.State.promotionXp, CanChange = sync.CanAct, CareReady = wait == 0, CareLabel = wait == 0 ? "간식 주기 +10 XP" : "간식 · " + wait + "초 뒤", Status = sync.Status, RewardNote = "웹 규칙 · 간식 30초 / 훈련 5초 · 성공 " + sync.State.obedience + "%" };
        }

        private async Task<CommandReply> Ask(string query, string app)
        {
            CommandReply reply = catalog.Resolve(query, app, CurrentCompanion().Grade);
            if (reply.Status == "success" && reply.Command.kind == "training")
            {
                if (sync.IsLinked)
                {
                    DesktopActionResponse response = await sync.ActAsync("train", sync.State.puppy.id, reply.Command.id);
                    reply.Detail = response.message;
                    reply.Bubble = response.success ? "‘" + reply.Command.label + "’ 성공했어 멍!" : "아직 연습 중이야 멍!";
                    reply.Status = response.success ? "success" : "practice";
                    if (response.success) state.Train(reply.Command.id, Now);
                }
                else
                {
                    reply = catalog.Execute(query, app, progress, DateTime.UtcNow);
                    state.Train(reply.Command.id, Now); SaveSettings(); UpdateProgress();
                }
            }
            Speak(reply.Bubble);
            return reply;
        }

        private async Task<string> GiveCare()
        {
            if (sync.IsLinked)
            {
                DesktopActionResponse response = await sync.ActAsync("feed", sync.State.puppy.id, null);
                if (response.success) { state.Input(InputKind.Pet, Now); feedingUntil = Now + 2.2; }
                Speak(response.message); return response.message;
            }
            state.Input(InputKind.Pet, Now);
            feedingUntil = Now + 2.2;
            string message = "간식 잘 먹었어 멍!\r\n" + progress.RewardActivity(DateTime.UtcNow);
            Speak("간식 고마워 멍!"); SaveSettings(); UpdateProgress();
            return message;
        }

        private async Task Rest()
        {
            if (sync.IsLinked)
            {
                DesktopActionResponse response = await sync.ActAsync("rest", sync.State.puppy.id, null);
                if (!response.success) { Speak(response.message); return; }
                Speak(response.message);
            }
            else Speak("잠깐 쉬고 올게 멍!");
            restingUntil = Now + 5;
            motion.SetPosition(Location);
            Invalidate();
        }

        private async Task<string> Promote()
        {
            if (sync.IsLinked)
            {
                DesktopActionResponse response = await sync.ActAsync("promote", sync.State.puppy.id, null);
                Speak(response.message); return response.message;
            }
            if (!progress.Promote()) return progress.IsMax ? "최고 등급이야 멍!" : "승급에는 100 XP가 필요해 멍!";
            string message = progress.Grade + " 등급으로 승급했어 멍! 새로운 명령을 배웠어.";
            Speak(message); SaveSettings(); UpdateProgress(); return message;
        }

        private void UpdateProgress()
        {
            if (IsDisposed) return;
            CompanionView current = CurrentCompanion();
            gradeItem.Text = current.Name + " · " + current.Summary;
            breedMenu.Enabled = !sync.IsLinked;
            breedMenu.Text = sync.IsLinked ? "강아지 고르기 · 웹에서 선택해 주세요" : "강아지 고르기";
            linkedStatus.Text = sync.IsLinked ? (sync.Online ? "연결 상태 · 웹과 함께 키우는 중" : "연결 상태 · 오프라인, 돌봄은 잠시 멈춤") : "연결 상태 · 이 PC의 강아지";
            disconnectMenu.Enabled = sync.IsLinked;
            careMenu.Text = current.CareLabel; careMenu.Enabled = current.CanChange && current.CareReady;
            restMenu.Enabled = current.CanChange;
            appearanceStatus.Visible = sync.IsLinked;
            appearanceStatus.Text = "강아지 모습 · " + AppearanceStatus;
            if (questions != null && !questions.IsDisposed) questions.RefreshProgress();
            Invalidate();
        }

        private DesktopAppearanceFrames CurrentAppearance
        {
            get
            {
                string selectedBreed = breed;
                if (sync.IsLinked && sync.State != null && sync.State.puppy != null
                    && sync.State.puppy.breed >= 0 && sync.State.puppy.breed < BreedIds.Length)
                    selectedBreed = BreedIds[sync.State.puppy.breed];
                DesktopAppearanceFrames current = appearanceCache.Current;
                if (sync.IsLinked && current != null && current.StyleId == BundledRubyAppearanceLibrary.StyleId
                    && current.BreedId == selectedBreed) return current;
                return bundledRuby.Get(selectedBreed);
            }
        }

        private string AppearanceStatus
        {
            get { return sync.State != null && !String.IsNullOrEmpty(sync.State.appearanceError) ? sync.State.appearanceError : appearanceCache.Status; }
        }

        private async void OnSyncChanged()
        {
            if (IsDisposed || Disposing) return;
            // Show the bundled Ruby breed immediately while the matching verified
            // linked image is being downloaded, including its native aspect ratio.
            OnAppearanceChanged();
            await RefreshAppearance();
        }

        private Task RefreshAppearance()
        {
            if (sync.IsLinked && sync.State != null && !String.IsNullOrEmpty(sync.State.appearanceError)) return Task.FromResult(0);
            return appearanceCache.UpdateAsync(sync.State == null ? null : sync.State.appearance, sync.Origin);
        }

        private void OnAppearanceChanged()
        {
            if (IsDisposed || Disposing) return;
            paintedSource = null; paintedMask = null; paintedWidth = paintedHeight = 0; renderingFrame = null;
            activeScene = null; activeReaction = null;
            Size previous = Size;
            ApplySize();
            if (Size != previous) KeepOnScreen();
            UpdateProgress();
        }

        private void ApplySize()
        {
            DesktopAppearanceFrames current = CurrentAppearance;
            Size display = current == null ? new Size(scale * 64, scale * 64) : DesktopAppearanceFrames.DisplaySize(current.Width, current.Height, scale);
            Size next = new Size(display.Width + 16, display.Height + 48);
            if (Size != next) { Size = next; motion.SetPosition(Location); }
        }
        private void PutAtCorner()
        {
            Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
            Location = new Point(area.Right - Width - 24, area.Bottom - Height - 12);
            motion.SetPosition(Location);
        }
        private void RestorePet() { PutAtCorner(); SetFollow(false); Show(); KeepOnScreen(); SaveSettings(); }
        private void KeepOnScreen()
        {
            Rectangle area = Screen.FromRectangle(Bounds).WorkingArea;
            Location = new Point(Math.Max(area.Left, Math.Min(Left, area.Right - Width)), Math.Max(area.Top, Math.Min(Top, area.Bottom - Height)));
            motion.SetPosition(Location);
        }
        private void RefreshScreens()
        {
            Screen[] screens = Screen.AllScreens; workingAreas = new Rectangle[screens.Length];
            for (int i = 0; i < screens.Length; i++) workingAreas[i] = screens[i].WorkingArea;
        }
        private void OnDisplayChanged(object sender, EventArgs args)
        {
            if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(delegate { RefreshScreens(); KeepOnScreen(); }));
        }
        private void LoadSettings()
        {
            try
            {
                if (!File.Exists(settingsPath)) return;
                string[] values = File.ReadAllLines(settingsPath);
                int x, y, size;
                if (values.Length < 5) return;
                if (Array.IndexOf(BreedIds, values[0]) >= 0) breed = values[0];
                if (int.TryParse(values[1], out size)) scale = Math.Max(2, Math.Min(4, size));
                if (int.TryParse(values[2], out x) && int.TryParse(values[3], out y)) Location = new Point(x, y);
                showHints = values[4] != "false";
                followMouse = ReadFollowSetting(values);
                progress.Load(values);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        internal static bool ReadFollowSetting(string[] values)
        {
            foreach (string value in values) if (value.StartsWith("followMouse=")) return value != "followMouse=false";
            return true;
        }
        private void SaveSettings()
        {
            if (transient) return;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(settingsPath));
                var values = new List<string>(new[] { breed, scale.ToString(), Left.ToString(), Top.ToString(), showHints ? "true" : "false" });
                values.AddRange(progress.Save());
                values.Add("followMouse=" + (followMouse ? "true" : "false"));
                File.WriteAllLines(settingsPath, values.ToArray());
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            SaveSettings(); animation.Stop(); syncTimer.Stop(); statusTimer.Stop(); input.Stop(); tray.Visible = false;
            if (questions != null && !questions.IsDisposed) questions.Close();
            if (linkWindow != null && !linkWindow.IsDisposed) linkWindow.Close();
            bubble.Close();
            sync.Changed -= OnSyncChanged; appearanceCache.Changed -= OnAppearanceChanged; sync.Dispose(); appearanceCache.Dispose();
            SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            base.OnFormClosed(e);
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { animation.Dispose(); syncTimer.Dispose(); statusTimer.Dispose(); sync.Dispose(); appearanceCache.Dispose(); bundledRuby.Dispose(); input.Dispose(); tray.Dispose(); menu.Dispose(); bubble.Dispose(); }
            base.Dispose(disposing);
        }
    }

    internal static class SelfTest
    {
        internal static int Run(string output)
        {
            var report = new List<string>();
            try
            {
                PetState state = new PetState();
                Check(state.Mood(0) == "idle", "initial idle", report);
                state.Input(InputKind.Keyboard, 1);
                Check(state.Mood(1.2) == "typing", "keyboard reaction", report);
                for (int i = 0; i < 9; i++) state.Input(InputKind.Keyboard, 2 + i * .05);
                Check(state.Mood(2.6) == "excited", "typing burst", report);
                state.Input(InputKind.Keyboard, 6);
                Check(state.Mood(6.1) == "typing", "burst expires", report);
                state.Input(InputKind.Scroll, 7);
                Check(state.Mood(7.1) == "scroll", "scroll reaction", report);
                state.Input(InputKind.Click, 8);
                Check(state.Mood(8.1) == "play", "click reaction", report);
                state.Input(InputKind.Pet, 9);
                Check(state.Mood(9.1) == "love", "pet reaction", report);
                state.Input(InputKind.Move, 9.2);
                Check(state.Mood(9.3) == "love", "movement preserves reaction", report);
                state.Input(InputKind.Drag, 10); state.Input(InputKind.Keyboard, 10.1);
                Check(state.Mood(11) == "drag", "drag priority", report);
                state.Input(InputKind.Drop, 12);
                Check(state.Mood(12.1) == "love", "drop recovery", report);
                Check(state.Mood(60) == "sleep", "idle sleep", report);
                state.Input(InputKind.Move, 61);
                Check(state.Mood(61) == "idle", "wake on movement", report);
                state.SetEnabled(false, 62); state.Input(InputKind.Keyboard, 63);
                Check(state.Mood(64) == "idle", "pause ignores input", report);
                state.SetEnabled(true, 65); state.Input(InputKind.Keyboard, 66);
                Check(state.Mood(66.1) == "typing", "resume", report);
                state.Train("puppy-paw", 67); state.Input(InputKind.Click, 67.1);
                Check(state.Mood(67.2) == "typing" && state.Training(67.2) == "puppy-paw", "training preserves intentional reaction over global input", report);
                Check(state.Training(71) == null, "training reaction expires", report);
                state.SetEnabled(false, 72); state.Train("puppy-paw", 72.1); state.Input(InputKind.Keyboard, 72.2);
                Check(state.Mood(72.3) == "typing", "explicit training remains available when global input is paused", report);
                CommandCatalog catalog = CommandCatalog.Load();
                Check(catalog.Commands.Length == 28, "shared embedded catalog contains 28 commands", report);
                foreach (PuppyCommand command in catalog.Commands)
                {
                    Check(catalog.Resolve(command.label, command.app, command.requiredGrade).Status == "success", "catalog resolves " + command.id, report);
                    int index = Progression.GradeIndex(command.requiredGrade);
                    if (index > 0) Check(catalog.Resolve(command.label, command.app, Progression.Grades[index - 1]).Status == "locked", "grade gate " + command.id, report);
                    foreach (string alias in command.aliases)
                        if (catalog.Resolve(alias, command.app, "SSR").Status != "success") throw new Exception("Alias failed: " + command.id + ":" + alias);
                }
                Check(catalog.Resolve("엑셀 붙여 넣기 단축키 알려줘!", "auto", "R").Bubble == "Ctrl + V다 멍!", "natural shortcut query and puppy voice", report);
                Check(catalog.Resolve("엑셀에서 붙여넣기 단축키는 뭐야?", "auto", "R").Bubble == "Ctrl + V다 멍!", "Korean app particle query", report);
                Check(catalog.Resolve("한글 붙여넣기", "auto", "R").Status == "locked", "HWP shortcut remains locked at R", report);
                Check(catalog.Resolve("붙여넣기", "auto", "SSR").Status == "ambiguous", "missing app does not guess", report);
                Check(catalog.Resolve("엑셀 한글 복사", "auto", "SSR").Status == "ambiguous", "multiple apps do not guess", report);
                Check(catalog.Resolve("한글 복사", "excel", "SSR").Status == "ambiguous", "conflicting selected app does not guess", report);
                Check(catalog.Resolve("엑셀 복사 후 붙여넣기", "auto", "SSR").Status == "unknown", "multiple operations do not substring match", report);
                Check(catalog.Resolve("엑셀 매크로 실행", "auto", "SSR").Status == "unknown", "unknown operation does not guess", report);
                Check(catalog.Resolve(" ", "auto", "SSR").Status == "empty", "empty query prompts for input", report);
                Progression progress = new Progression();
                DateTime epoch = DateTime.UtcNow.AddHours(-1);
                Check(progress.Grade == "R" && progress.Xp == 0, "new desktop pet starts R", report);
                for (int i = 0; i < 100; i++) catalog.Execute("엑셀 붙여넣기", "auto", progress, epoch.AddSeconds(i));
                Check(progress.Xp == 0, "shortcut questions never earn XP", report);
                catalog.Execute("기다려", "puppy", progress, epoch);
                Check(progress.Xp == 0, "locked training never earns XP", report);
                catalog.Execute("손", "puppy", progress, epoch);
                Check(progress.Xp == 10, "successful training earns XP", report);
                progress.RewardActivity(epoch.AddSeconds(1));
                Check(progress.Xp == 10, "care shares training cooldown", report);
                Check(!progress.Promote() && progress.Grade == "R", "insufficient XP cannot promote", report);
                for (int i = 1; i <= 25; i++) progress.RewardActivity(epoch.AddSeconds(i * 10));
                Check(progress.Xp == 100 && progress.CanPromote, "XP caps at promotion cost", report);
                Check(progress.Promote() && progress.Grade == "SR" && progress.Xp == 0, "promotion consumes XP and unlocks next grade", report);
                Check(catalog.Execute("한글 붙여넣기", "auto", progress, epoch.AddSeconds(300)).Status == "success", "promotion unlocks HWP", report);
                for (int i = 1; i <= 10; i++) progress.RewardActivity(epoch.AddSeconds(300 + i * 10));
                Check(progress.Promote() && progress.Grade == "SSR", "second promotion reaches SSR", report);
                progress.RewardActivity(epoch.AddSeconds(500));
                Check(progress.Xp == 0 && !progress.Promote(), "maximum grade stays bounded", report);
                Progression saved = new Progression();
                saved.RewardActivity(epoch);
                string savedPath = Path.Combine(Path.GetDirectoryName(output), "progression-test.settings");
                File.WriteAllLines(savedPath, saved.Save());
                Progression restored = new Progression(); restored.Load(File.ReadAllLines(savedPath));
                restored.RewardActivity(epoch.AddSeconds(1));
                Check(restored.Grade == "R" && restored.Xp == 10 && restored.LastRewardUtc == epoch, "settings round-trip preserves grade XP and reward cooldown", report);
                restored.Load(new[] { "shiba", "3", "50", "60", "true" });
                Check(restored.Grade == "R" && restored.Xp == 0, "legacy five-line settings remain compatible", report);
                restored.Load(new[] { "grade=INVALID", "xp=-25", "lastRewardUtc=nonsense" });
                Check(restored.Grade == "R" && restored.Xp == 0, "corrupt settings recover safely", report);
                restored.Load(new[] { "grade=SR", "xp=99999" });
                Check(restored.Grade == "SR" && restored.Xp == 100, "saved XP is clamped", report);
                restored.Load(new[] { "grade=SSR", "xp=100" });
                Check(restored.IsMax && restored.Xp == 0, "saved max grade cannot accumulate XP", report);
                SyncTest.Units(report, output);
                PetMotionTest.Run(delegate(bool condition, string label) { Check(condition, label, report); });
                DesktopAppearanceFramesTest.Units(delegate(bool condition, string label) { Check(condition, label, report); });
                Check(PetWindow.ReadFollowSetting(new[] { "shiba", "3", "50", "60", "true" }), "legacy pet settings start with cursor following", report);
                Check(!PetWindow.ReadFollowSetting(new[] { "grade=SR", "xp=62", "followMouse=false" }), "explicit stop preference survives settings read", report);
                Check(PetWindow.ReadFollowSetting(new[] { "followMouse=true" }), "follow preference survives settings read", report);
                Check(PetBubble.ShortText("  Ctrl + V다 멍!\r\n ") == "Ctrl + V다 멍!", "bubble collapses whitespace into a short reply", report);
                Check(PetBubble.ShortText(new string('가', 120)).Length <= 66, "long replies stay bounded", report);
                Rectangle desktopArea = new Rectangle(-1280, 0, 1280, 960);
                Size bubbleSize = new Size(220, 42);
                Point bubbleTop = PetBubble.Place(new Rectangle(-1278, 0, 200, 220), bubbleSize, desktopArea);
                Check(desktopArea.Contains(new Rectangle(bubbleTop, bubbleSize)), "speech stays on screen at negative-coordinate top edge", report);
                using (var pet = new PetWindow(true)) pet.CheckPresentation(delegate(bool condition, string label) { Check(condition, label, report); });
                using (BundledRubyAppearanceLibrary library = new BundledRubyAppearanceLibrary())
                {
                    using (Bitmap sheet = new Bitmap(DesktopBreedCatalog.Ids.Length * 192, 5 * 192))
                    using (Graphics g = Graphics.FromImage(sheet))
                    {
                        g.Clear(Color.FromArgb(246, 241, 229));
                        string[] breeds = DesktopBreedCatalog.Ids;
                        string[] scenes = { "idle", "side", "walk", "happy", "sleep" };
                        Check(library.BreedCount == breeds.Length, "bundled Ruby Dot includes all 30 desktop breeds", report);
                        for (int b = 0; b < breeds.Length; b++)
                        {
                            DesktopAppearanceFrames appearance = library.Get(breeds[b]);
                            Check(appearance.StyleId == BundledRubyAppearanceLibrary.StyleId && appearance.BreedId == breeds[b],
                                "bundled Ruby Dot selects " + breeds[b], report);
                            Check(appearance.ReactionAnchors != null, "bundled Ruby Dot keeps mouse gaze and typing paw anchors for " + breeds[b], report);
                            if (b == 0)
                            {
                                Bitmap left = appearance.React("idle", "idle", null, .1, true, false, -1, 0).Image;
                                Bitmap right = appearance.React("idle", "idle", null, .1, true, false, 1, 0).Image;
                                bool changed = false;
                                for (int y = 0; y < left.Height && !changed; y++) for (int x = 0; x < left.Width; x++)
                                    if (left.GetPixel(x, y).ToArgb() != right.GetPixel(x, y).ToArgb()) { changed = true; break; }
                                Check(changed, "bundled Ruby Dot eyes visibly follow the mouse together", report);
                            }
                            for (int s = 0; s < scenes.Length; s++)
                                PetWindow.DrawPet(g, appearance.Get(scenes[s], scenes[s] == "walk" ? 1 : 0, false).Image,
                                    new Rectangle(b * 192, s * 192, 192, 192));
                        }
                        sheet.Save(Path.ChangeExtension(output, ".png"), ImageFormat.Png);
                    }
                    Check(library.Get("unknown-breed").BreedId == "pomeranian", "unknown standalone breed safely uses Ruby Pomeranian", report);
                }
                string[] embedded = Assembly.GetExecutingAssembly().GetManifestResourceNames();
                int rubyResources = 0;
                foreach (string resource in embedded)
                {
                    if (resource.StartsWith("ruby-default-", StringComparison.Ordinal) && resource.EndsWith(".rubypng", StringComparison.Ordinal)) rubyResources++;
                    bool allowed = resource == "commands.json" || resource == "breed-catalog.json" || resource == "puppy.ico"
                        || resource == "ruby-default-manifest.json" || (resource.StartsWith("ruby-default-", StringComparison.Ordinal) && resource.EndsWith(".rubypng", StringComparison.Ordinal));
                    if (!allowed) Check(false, "shipping executable excludes retired sprite resource " + resource, report);
                }
                Check(rubyResources == 150 && embedded.Length == 154, "shipping executable contains exactly 150 Ruby scenes and four required resources", report);
                File.WriteAllLines(output, report.ToArray());
                return 0;
            }
            catch (Exception error) { report.Add("FAIL " + error); File.WriteAllLines(output, report.ToArray()); return 1; }
        }
        private static void Check(bool condition, string label, List<string> report)
        {
            if (!condition) throw new Exception(label);
            report.Add("PASS " + label);
        }
    }
}
