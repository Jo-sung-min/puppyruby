using System;
using System.Collections.Generic;

namespace PuppyRubyDesktop
{
    internal enum InputKind { Keyboard, Click, Scroll, Move, Pet, Drag, Drop }

    internal sealed class PetState
    {
        private readonly Queue<double> keyTimes = new Queue<double>();
        private string reaction = "idle";
        private double until;
        private double lastActivity;
        private bool dragging;
        private string training;
        private double trainingUntil;
        internal bool Enabled = true;
        internal double IdleSeconds = 45;

        internal void SetEnabled(bool enabled, double now)
        {
            Enabled = enabled; keyTimes.Clear(); reaction = "idle";
            dragging = false; lastActivity = now; until = now;
            training = null;
        }

        internal void Train(string commandId, double now)
        {
            training = commandId; trainingUntil = now + 3.5; lastActivity = now;
        }

        internal string Training(double now) { return now < trainingUntil ? training : null; }

        internal void Input(InputKind kind, double now)
        {
            if (!Enabled) return;
            lastActivity = now;
            if (kind == InputKind.Move) return;
            if (kind == InputKind.Drag) { dragging = true; return; }
            if (kind == InputKind.Drop) { dragging = false; reaction = "love"; until = now + 1.3; return; }
            if (dragging) return;
            if (kind == InputKind.Keyboard)
            {
                while (keyTimes.Count > 0 && now - keyTimes.Peek() > 1.2) keyTimes.Dequeue();
                keyTimes.Enqueue(now);
                // Bounded state: only recent event timestamps, never key identities.
                while (keyTimes.Count > 64) keyTimes.Dequeue();
                reaction = keyTimes.Count >= 8 ? "excited" : "typing";
                until = now + .85;
            }
            else if (kind == InputKind.Pet) { reaction = "love"; until = now + 1.8; }
            else if (kind == InputKind.Click) { reaction = "play"; until = now + .55; }
            else if (kind == InputKind.Scroll) { reaction = "scroll"; until = now + .7; }
        }

        internal string Mood(double now)
        {
            if (dragging) return "drag";
            if (Training(now) != null)
                return training == "puppy-bang" ? "sleep" : training == "puppy-paw" ? "typing" : training == "puppy-turn" ? "play" : "idle";
            if (!Enabled) return "idle";
            if (now < until) return reaction;
            if (now - lastActivity >= IdleSeconds) return "sleep";
            return "idle";
        }
    }
}
