using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace PuppyRubyDesktop
{
    // Only event categories cross this boundary. Never marshal keyboard lParam:
    // it contains the actual virtual key / scan code and is not needed by a pet.
    internal sealed class NativeInput : IDisposable
    {
        private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
        private readonly HookProc keyboardProc;
        private readonly HookProc mouseProc;
        private IntPtr keyboard;
        private IntPtr mouse;
        internal event Action<InputKind> Activity;
        internal bool Active { get { return keyboard != IntPtr.Zero && mouse != IntPtr.Zero; } }

        internal NativeInput() { keyboardProc = OnKeyboard; mouseProc = OnMouse; }

        internal void Start()
        {
            if (Active) return;
            Stop();
            keyboard = SetWindowsHookEx(13, keyboardProc, GetModuleHandle(null), 0);
            if (keyboard == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            mouse = SetWindowsHookEx(14, mouseProc, GetModuleHandle(null), 0);
            if (mouse == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                Stop();
                throw new Win32Exception(error);
            }
        }

        private IntPtr OnKeyboard(int code, IntPtr message, IntPtr data)
        {
            if (code >= 0 && (message.ToInt64() == 0x100 || message.ToInt64() == 0x104))
            {
                Action<InputKind> handler = Activity;
                if (handler != null) handler(InputKind.Keyboard);
            }
            return CallNextHookEx(IntPtr.Zero, code, message, data);
        }

        private IntPtr OnMouse(int code, IntPtr message, IntPtr data)
        {
            if (code >= 0)
            {
                InputKind? kind = MouseInput(message.ToInt64());
                Action<InputKind> handler = Activity;
                if (handler != null)
                {
                    if (kind.HasValue) handler(kind.Value);
                }
            }
            return CallNextHookEx(IntPtr.Zero, code, message, data);
        }

        internal static InputKind? MouseInput(long message)
        {
            if (message == 0x201) return InputKind.Click;
            if (message == 0x204 || message == 0x207) return InputKind.AuxiliaryClick;
            if (message == 0x20A || message == 0x20E) return InputKind.Scroll;
            return null;
        }

        internal void Stop()
        {
            if (keyboard != IntPtr.Zero) { UnhookWindowsHookEx(keyboard); keyboard = IntPtr.Zero; }
            if (mouse != IntPtr.Zero) { UnhookWindowsHookEx(mouse); mouse = IntPtr.Zero; }
        }
        public void Dispose() { Stop(); }

        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
        [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string module);
    }
}
