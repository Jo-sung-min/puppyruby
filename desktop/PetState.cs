using System;
using System.Collections.Generic;

namespace PuppyRubyDesktop
{
    internal enum InputKind { Keyboard, Click, Scroll, Move, Pet, Drag, Drop, AuxiliaryClick }

    internal sealed class PetState
    {
        private readonly Queue<double> keyTimes = new Queue<double>();
        private readonly Queue<double> clickTimes = new Queue<double>();
        internal const double BellyDurationSeconds = 2.4;
        private const double ClickWindowSeconds = 1.2;
        private double bellyStarted = Double.NegativeInfinity;
        private double lastInputTime = Double.NegativeInfinity;
        internal double BellyStartedAt { get { return bellyStarted; } }
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
            Enabled = enabled; keyTimes.Clear(); clickTimes.Clear(); reaction = "idle";
            bellyStarted = Double.NegativeInfinity; lastInputTime = now;
            dragging = false; lastActivity = now; until = now;
            training = null;
        }

        internal void Train(string commandId, double now)
        {
            clickTimes.Clear(); keyTimes.Clear(); bellyStarted = Double.NegativeInfinity;
            reaction = "idle"; until = now;
            training = commandId; trainingUntil = now + 3.5; lastActivity = now;
        }

        internal string Training(double now) { return now < trainingUntil ? training : null; }

        internal void Input(InputKind kind, double now)
        {
            if (!Enabled) return;
            if (Double.IsNaN(now) || Double.IsInfinity(now)) return;
            if (now < lastInputTime - 1e-9)
            {
                // A reset clock cannot turn old timestamps into a fresh burst.
                clickTimes.Clear(); keyTimes.Clear(); bellyStarted = Double.NegativeInfinity;
                reaction = "idle"; until = now;
            }
            lastInputTime = now;
            lastActivity = now;
            if (kind == InputKind.Move) return;
            if (kind == InputKind.Drag)
            {
                clickTimes.Clear(); keyTimes.Clear(); bellyStarted = Double.NegativeInfinity;
                reaction = "idle"; until = now; dragging = true; return;
            }
            if (kind == InputKind.Drop)
            {
                if (!dragging && reaction == "belly" && now < until) return;
                clickTimes.Clear(); dragging = false; reaction = "love"; until = now + 1.3; return;
            }
            if (dragging) return;
            // A fixed-duration reaction survives click-up petting, cursor hover,
            // typing and extra clicks. It cannot be prolonged by more input.
            if (reaction == "belly" && now < until) return;
            if (Training(now) != null) { clickTimes.Clear(); return; }
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
            else if (kind == InputKind.Click)
            {
                while (clickTimes.Count > 0 && now - clickTimes.Peek() > ClickWindowSeconds + 1e-9) clickTimes.Dequeue();
                clickTimes.Enqueue(now);
                if (clickTimes.Count >= 5)
                {
                    clickTimes.Clear(); keyTimes.Clear(); bellyStarted = now;
                    reaction = "belly"; until = now + BellyDurationSeconds;
                }
                else { reaction = "play"; until = now + .55; }
            }
            else if (kind == InputKind.AuxiliaryClick) { reaction = "play"; until = now + .55; }
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
