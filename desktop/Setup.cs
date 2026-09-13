using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("PuppyRuby Setup")]
[assembly: AssemblyDescription("퍼피루비 설치 및 바탕화면 바로가기 만들기")]
[assembly: AssemblyProduct("PuppyRuby")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace PuppyRubySetup
{
    internal static class Program
    {
        [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();

        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length == 2 && args[0] == "--self-test") return SetupTests.Run(args[1]);
            if (args.Length != 0) return 2;
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                Application.Run(new SetupWindow());
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show("설치 준비를 하지 못했어요.\n" + error.Message, "퍼피루비 설치", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 1;
            }
        }
    }

    internal sealed class InstallPaths
    {
        internal readonly string AppDirectory;
        internal readonly string DesktopDirectory;
        internal readonly string MenuDirectory;
        internal string Executable { get { return Path.Combine(AppDirectory, "PuppyRuby.exe"); } }
        internal string DesktopShortcut { get { return Path.Combine(DesktopDirectory, "퍼피루비.lnk"); } }
        internal string MenuShortcut { get { return Path.Combine(MenuDirectory, "퍼피루비.lnk"); } }

        internal InstallPaths(string app, string desktop, string menu)
        {
            if (String.IsNullOrWhiteSpace(app) || String.IsNullOrWhiteSpace(desktop) || String.IsNullOrWhiteSpace(menu))
                throw new ArgumentException("설치할 폴더를 찾지 못했어요.");
            AppDirectory = Path.GetFullPath(app);
            DesktopDirectory = Path.GetFullPath(desktop);
            MenuDirectory = Path.GetFullPath(menu);
        }

        internal static InstallPaths ForCurrentUser()
        {
            return new InstallPaths(
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "PuppyRuby"),
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "퍼피루비"));
        }
    }

    internal static class SetupFiles
    {
        internal static Stream OpenPayload()
        {
            Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("PuppyRuby.exe");
            if (stream == null) throw new InvalidDataException("설치 파일에 강아지 앱이 없어요. 다시 다운로드해 주세요.");
            return stream;
        }

        internal static string Hash(Stream stream)
        {
            using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "");
        }

        internal static string HashFile(string path)
        {
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) return Hash(stream);
        }

        internal static void Install(InstallPaths paths, Func<Stream> payload)
        {
            Directory.CreateDirectory(paths.AppDirectory);
            string expectedHash;
            using (Stream source = payload()) expectedHash = Hash(source);
            bool alreadyInstalled = File.Exists(paths.Executable) && HashFile(paths.Executable) == expectedHash;
            if (!alreadyInstalled)
            {
                string staged = Path.Combine(paths.AppDirectory, ".puppyruby-" + Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    using (Stream source = payload())
                    using (FileStream destination = new FileStream(staged, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        source.CopyTo(destination);
                        destination.Flush(true);
                    }
                    if (HashFile(staged) != expectedHash) throw new InvalidDataException("앱 파일 확인에 실패했어요. 다시 설치해 주세요.");
                    if (File.Exists(paths.Executable))
                    {
                        // Check a running version before atomic replacement. Failed updates keep the old executable intact.
                        using (new FileStream(paths.Executable, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
                        File.Replace(staged, paths.Executable, null);
                    }
                    else File.Move(staged, paths.Executable);
                }
                catch (IOException error)
                {
                    throw new IOException("앱 파일을 바꾸지 못했어요. 실행 중인 퍼피루비를 종료한 뒤 다시 시도해 주세요.\n폴더에 쓸 수 있는지도 확인해 주세요.", error);
                }
                finally
                {
                    if (File.Exists(staged)) File.Delete(staged);
                }
            }
            Directory.CreateDirectory(paths.DesktopDirectory);
            Directory.CreateDirectory(paths.MenuDirectory);
            Shortcuts.Save(paths.DesktopShortcut, paths.Executable);
            Shortcuts.Save(paths.MenuShortcut, paths.Executable);
            File.WriteAllText(Path.Combine(paths.AppDirectory, "설치 안내.txt"),
                "퍼피루비\r\n\r\n바탕화면 또는 시작 메뉴의 ‘퍼피루비’를 눌러 실행하세요.\r\n" +
                "설치 폴더: " + paths.AppDirectory + "\r\n\r\n" +
                "삭제하려면 강아지 메뉴에서 종료한 뒤 이 설치 폴더와 바탕화면·시작 메뉴의 바로가기를 지우세요.\r\n" +
                "기존 강아지 설정과 웹 연결 정보는 %LOCALAPPDATA%\\PuppyRuby에 별도로 보관됩니다.\r\n" +
                "Windows를 켤 때 자동으로 실행하도록 설정하지 않습니다.\r\n", new UTF8Encoding(true));
        }

        internal static void Launch(InstallPaths paths)
        {
            Process.Start(new ProcessStartInfo(paths.Executable) { WorkingDirectory = paths.AppDirectory, UseShellExecute = true });
        }
    }

    // Native Shell Links avoid depending on Windows Script Host, which can be disabled on managed PCs.
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")] internal class ShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int maxPath, IntPtr findData, uint flags);
        void GetIDList(out IntPtr idList);
        void SetIDList(IntPtr idList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder description, int maxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string description);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int maxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int maxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int showCommand);
        void SetShowCmd(int showCommand);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder iconPath, int maxPath, out int iconIndex);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string iconPath, int iconIndex);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    internal static class Shortcuts
    {
        internal static void Save(string shortcutPath, string executable)
        {
            string staged = Path.Combine(Path.GetDirectoryName(shortcutPath), ".puppyruby-" + Guid.NewGuid().ToString("N") + ".lnk");
            object instance = new ShellLink();
            try
            {
                IShellLinkW link = (IShellLinkW)instance;
                link.SetPath(executable);
                link.SetWorkingDirectory(Path.GetDirectoryName(executable));
                link.SetArguments("");
                link.SetDescription("퍼피루비 강아지 실행");
                link.SetIconLocation(executable, 0);
                link.SetShowCmd(1);
                ((IPersistFile)instance).Save(staged, true);
                if (File.Exists(shortcutPath)) File.Replace(staged, shortcutPath, null);
                else File.Move(staged, shortcutPath);
            }
            finally
            {
                Marshal.FinalReleaseComObject(instance);
                if (File.Exists(staged)) File.Delete(staged);
            }
        }

        internal static string[] Read(string shortcutPath)
        {
            object instance = new ShellLink();
            try
            {
                ((IPersistFile)instance).Load(shortcutPath, 0);
                IShellLinkW link = (IShellLinkW)instance;
                StringBuilder target = new StringBuilder(32768), directory = new StringBuilder(32768), arguments = new StringBuilder(32768), icon = new StringBuilder(32768);
                int iconIndex;
                link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
                link.GetWorkingDirectory(directory, directory.Capacity);
                link.GetArguments(arguments, arguments.Capacity);
                link.GetIconLocation(icon, icon.Capacity, out iconIndex);
                return new string[] { target.ToString(), directory.ToString(), arguments.ToString(), icon.ToString(), iconIndex.ToString() };
            }
            finally { Marshal.FinalReleaseComObject(instance); }
        }
    }

    internal sealed class SetupWindow : Form
    {
        private readonly InstallPaths paths = InstallPaths.ForCurrentUser();
        private readonly Label message;
        private readonly Button install;
        private readonly Button cancel;
        private readonly ProgressBar progress;
        private bool busy;
        private bool installed;

        internal void PreparePreview()
        {
            IntPtr window = Handle;
            foreach (Control control in Controls) { IntPtr child = control.Handle; }
            PerformLayout();
        }

        internal SetupWindow()
        {
            Text = "퍼피루비 설치";
            ClientSize = new Size(560, 370);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("맑은 고딕", 10F);
            BackColor = Color.White;
            ForeColor = Color.FromArgb(28, 28, 31);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Controls.Add(new Label { Text = "바탕화면에서 만나는 퍼피루비", Font = new Font(Font.FontFamily, 18F, FontStyle.Bold), Location = new Point(28, 26), Size = new Size(505, 45) });
            Controls.Add(new Label { Text = "바탕화면과 시작 메뉴에 바로가기를 만들어요.\n다음부터는 ‘퍼피루비’를 누르면 바로 실행돼요.", Location = new Point(30, 86), Size = new Size(500, 58) });
            Controls.Add(new Label { Text = "설치 위치", Font = new Font(Font, FontStyle.Bold), Location = new Point(30, 158), Size = new Size(490, 25) });
            Controls.Add(new TextBox { Text = paths.AppDirectory, ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = Color.White, ForeColor = Color.DimGray, Location = new Point(30, 187), Size = new Size(500, 38), Multiline = true, TabStop = false });
            message = new Label { Text = "기존 강아지와 연결 정보는 그대로 유지돼요.", Location = new Point(30, 236), Size = new Size(500, 43) };
            Controls.Add(message);
            progress = new ProgressBar { Location = new Point(30, 280), Size = new Size(500, 5), Style = ProgressBarStyle.Marquee, Visible = false };
            Controls.Add(progress);
            cancel = new Button { Text = "닫기", Location = new Point(296, 306), Size = new Size(90, 40), FlatStyle = FlatStyle.Flat };
            cancel.FlatAppearance.BorderColor = Color.LightGray;
            cancel.Click += delegate { Close(); };
            Controls.Add(cancel);
            install = new Button { Text = "설치하고 실행", Location = new Point(396, 306), Size = new Size(135, 40), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(24, 24, 27), ForeColor = Color.White };
            install.FlatAppearance.BorderSize = 0;
            install.Click += delegate { if (installed) LaunchPuppy(); else BeginInstall(); };
            Controls.Add(install);
            AcceptButton = install;
            CancelButton = cancel;
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
        }

        private void BeginInstall()
        {
            busy = true;
            install.Enabled = cancel.Enabled = false;
            progress.Visible = true;
            message.Text = "강아지와 바로가기를 준비하고 있어요…";
            BackgroundWorker worker = new BackgroundWorker();
            worker.DoWork += delegate { SetupFiles.Install(paths, SetupFiles.OpenPayload); };
            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs e)
            {
                busy = false;
                install.Enabled = cancel.Enabled = true;
                progress.Visible = false;
                worker.Dispose();
                if (e.Error != null)
                {
                    message.Text = "설치를 완료하지 못했어요. 아래 안내를 확인해 주세요.";
                    install.Text = "다시 시도";
                    MessageBox.Show(this, e.Error is UnauthorizedAccessException ? "설치 폴더나 바로가기를 만들 수 없어요. 해당 폴더의 쓰기 권한을 확인해 주세요." : e.Error.Message, "퍼피루비 설치", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                installed = true;
                install.Text = "강아지 실행";
                message.Text = "바로가기를 만들었어요. 강아지를 실행할게요.";
                LaunchPuppy();
            };
            worker.RunWorkerAsync();
        }

        private void LaunchPuppy()
        {
            try { SetupFiles.Launch(paths); Close(); }
            catch (Exception error)
            {
                message.Text = "설치는 끝났어요. 바탕화면의 ‘퍼피루비’에서도 실행할 수 있어요.";
                MessageBox.Show(this, "강아지를 바로 실행하지 못했어요.\n" + error.Message, "퍼피루비 실행", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }

    internal static class SetupTests
    {
        private static int checks;

        private static void Check(bool condition, string description)
        {
            if (!condition) throw new InvalidOperationException(description);
            checks++;
        }

        private static void CheckShortcut(string path, InstallPaths paths)
        {
            Check(File.Exists(path), "shortcut exists: " + Path.GetFileName(path));
            string[] values = Shortcuts.Read(path);
            Check(String.Equals(values[0], paths.Executable, StringComparison.OrdinalIgnoreCase), "shortcut target");
            Check(String.Equals(values[1], paths.AppDirectory, StringComparison.OrdinalIgnoreCase), "shortcut working directory");
            Check(values[2] == "", "shortcut has no unwanted arguments");
            Check(String.Equals(values[3], paths.Executable, StringComparison.OrdinalIgnoreCase) && values[4] == "0", "shortcut icon");
        }

        internal static int Run(string requestedRoot)
        {
            string root;
            try
            {
                root = Path.GetFullPath(requestedRoot);
                string allowed = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "setup-tests") + Path.DirectorySeparatorChar;
                if (!root.StartsWith(allowed, StringComparison.OrdinalIgnoreCase) || Directory.Exists(root) || File.Exists(root)) return 2;
                Directory.CreateDirectory(root);
            }
            catch { return 2; }
            string report = Path.Combine(root, "self-test.txt");
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (SetupWindow preview = new SetupWindow())
                using (Bitmap screenshot = new Bitmap(preview.Width, preview.Height))
                {
                    preview.PreparePreview();
                    preview.DrawToBitmap(screenshot, new Rectangle(Point.Empty, screenshot.Size));
                    screenshot.Save(Path.Combine(root, "setup-preview.png"), System.Drawing.Imaging.ImageFormat.Png);
                }
                Check(File.Exists(Path.Combine(root, "setup-preview.png")), "installer preview rendered without showing a window");
                InstallPaths paths = new InstallPaths(Path.Combine(root, "한글 사용자", "Programs", "PuppyRuby"), Path.Combine(root, "한글 사용자", "Desktop"), Path.Combine(root, "한글 사용자", "Start Menu", "퍼피루비"));
                string data = Path.Combine(root, "한글 사용자", "PuppyRuby");
                Directory.CreateDirectory(data);
                string settings = Path.Combine(data, "desktop.settings"), linkData = Path.Combine(data, "desktop.link");
                File.WriteAllText(settings, "existing-puppy-progress");
                File.WriteAllText(linkData, "existing-encrypted-link-fixture");
                string expectedHash;
                using (Stream payload = SetupFiles.OpenPayload())
                {
                    Check(payload.Length > 1024, "embedded executable is present");
                    Check(payload.ReadByte() == 'M' && payload.ReadByte() == 'Z', "embedded file is a Windows executable");
                    payload.Position = 0;
                    expectedHash = SetupFiles.Hash(payload);
                }
                SetupFiles.Install(paths, SetupFiles.OpenPayload);
                Check(SetupFiles.HashFile(paths.Executable) == expectedHash, "first install copies exact embedded executable");
                CheckShortcut(paths.DesktopShortcut, paths);
                CheckShortcut(paths.MenuShortcut, paths);
                Check(File.ReadAllText(settings) == "existing-puppy-progress", "existing settings preserved");
                Check(File.ReadAllText(linkData) == "existing-encrypted-link-fixture", "existing link preserved");
                Check(File.Exists(Path.Combine(paths.AppDirectory, "설치 안내.txt")), "removal and location instructions exist");
                DateTime originalWrite = File.GetLastWriteTimeUtc(paths.Executable);
                File.Delete(paths.DesktopShortcut);
                using (new FileStream(paths.Executable, FileMode.Open, FileAccess.Read, FileShare.Read))
                    SetupFiles.Install(paths, SetupFiles.OpenPayload);
                Check(File.GetLastWriteTimeUtc(paths.Executable) == originalWrite, "identical version is reused while running");
                CheckShortcut(paths.DesktopShortcut, paths);
                Check(Directory.GetFiles(paths.DesktopDirectory, "*.lnk").Length == 1, "reinstall does not duplicate desktop shortcuts");
                Check(Directory.GetFiles(paths.MenuDirectory, "*.lnk").Length == 1, "reinstall does not duplicate menu shortcuts");
                string previousShortcutHash = SetupFiles.HashFile(paths.DesktopShortcut);
                bool failedShortcutWhileLocked = false;
                using (new FileStream(paths.DesktopShortcut, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    try { Shortcuts.Save(paths.DesktopShortcut, paths.Executable); }
                    catch (IOException) { failedShortcutWhileLocked = true; }
                }
                Check(failedShortcutWhileLocked, "locked shortcut update fails safely");
                Check(SetupFiles.HashFile(paths.DesktopShortcut) == previousShortcutHash, "failed shortcut update preserves original shortcut");
                Check(Directory.GetFiles(paths.DesktopDirectory, "*.lnk").Length == 1, "failed shortcut update removes temporary shortcut");
                byte[] replacement = Encoding.UTF8.GetBytes("MZ-simulated-new-version-for-update-test");
                Func<Stream> changedPayload = delegate { return new MemoryStream(replacement, false); };
                bool failedWhileLocked = false;
                using (new FileStream(paths.Executable, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    try { SetupFiles.Install(paths, changedPayload); }
                    catch (IOException error) { failedWhileLocked = error.Message.Contains("종료"); }
                }
                Check(failedWhileLocked, "running old version gives retry guidance");
                Check(SetupFiles.HashFile(paths.Executable) == expectedHash, "failed update preserves existing executable");
                Check(Directory.GetFiles(paths.AppDirectory, "*.tmp").Length == 0, "failed update removes staged files");
                SetupFiles.Install(paths, changedPayload);
                Check(File.ReadAllBytes(paths.Executable).Length == replacement.Length, "unlocked version is replaced");
                using (Stream changed = changedPayload()) Check(SetupFiles.HashFile(paths.Executable) == SetupFiles.Hash(changed), "updated bytes match payload");
                SetupFiles.Install(paths, SetupFiles.OpenPayload);
                Check(SetupFiles.HashFile(paths.Executable) == expectedHash, "reinstall restores complete puppy executable");
                CheckShortcut(paths.MenuShortcut, paths);
                Check(File.ReadAllText(settings) == "existing-puppy-progress" && File.ReadAllText(linkData) == "existing-encrypted-link-fixture", "all updates preserve puppy data");
                Exception backgroundError = null;
                bool backgroundWasMta = false;
                using (ManualResetEvent finished = new ManualResetEvent(false))
                using (BackgroundWorker worker = new BackgroundWorker())
                {
                    worker.DoWork += delegate
                    {
                        try
                        {
                            backgroundWasMta = Thread.CurrentThread.GetApartmentState() == ApartmentState.MTA;
                            SetupFiles.Install(paths, SetupFiles.OpenPayload);
                        }
                        catch (Exception error) { backgroundError = error; }
                        finally { finished.Set(); }
                    };
                    worker.RunWorkerAsync();
                    Check(finished.WaitOne(TimeSpan.FromSeconds(30)), "background installation completes");
                }
                Check(backgroundWasMta, "installation uses the same MTA worker as the installer UI");
                Check(backgroundError == null, "background installer supports Shell Links: " + (backgroundError == null ? "OK" : backgroundError.ToString()));
                CheckShortcut(paths.DesktopShortcut, paths);
                CheckShortcut(paths.MenuShortcut, paths);
                File.WriteAllText(report, "PASS: " + checks + " installer checks\r\n" +
                    "Embedded PuppyRuby SHA256: " + expectedHash + "\r\n" +
                    "First install, real Shell Links, Korean and spaced paths, idempotent repair, locked upgrade, atomic replacement, data preservation verified.\r\n" +
                    "No app was launched. All test files are inside: " + root + "\r\n", new UTF8Encoding(false));
                return 0;
            }
            catch (Exception error)
            {
                File.WriteAllText(report, "FAIL after " + checks + " checks: " + error.ToString(), new UTF8Encoding(false));
                return 1;
            }
        }
    }
}
