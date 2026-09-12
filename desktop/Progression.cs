using System;
using System.Globalization;
using System.Collections.Generic;

namespace PuppyRubyDesktop
{
    internal sealed class Progression
    {
        internal static readonly string[] Grades = { "N", "R", "SR", "SSR" };
        internal const int PromotionCost = 100;
        internal const int Reward = 10;
        internal const int CooldownSeconds = 10;
        internal string Grade { get; private set; }
        internal int Xp { get; private set; }
        internal DateTime LastRewardUtc { get; private set; }

        internal Progression() { Grade = "R"; LastRewardUtc = DateTime.MinValue; }
        internal static int GradeIndex(string grade) { return Array.IndexOf(Grades, grade); }
        internal bool IsMax { get { return Grade == "SSR"; } }
        internal bool CanPromote { get { return !IsMax && Xp >= PromotionCost; } }
        internal string Summary { get { return Grade + " 등급 · " + (IsMax ? "최고 등급" : Xp + " / " + PromotionCost + " XP"); } }

        // Only explicit care and successful unlocked training call this method.
        // Global input activity and shortcut lookups never call it.
        internal string RewardActivity(DateTime now)
        {
            if (IsMax) return "모든 명령을 배웠어 멍!";
            if (Xp >= PromotionCost) return "승급할 준비가 됐어 멍! ‘승급하기’를 눌러 줘.";
            if (now < LastRewardUtc.AddSeconds(CooldownSeconds))
            {
                int remaining = Math.Max(1, (int)Math.Ceiling((LastRewardUtc.AddSeconds(CooldownSeconds) - now).TotalSeconds));
                return "잘했어 멍! 경험치는 " + remaining + "초 뒤 다시 받을 수 있어.";
            }
            Xp = Math.Min(PromotionCost, Xp + Reward);
            LastRewardUtc = now;
            return "+" + Reward + " XP! " + (CanPromote ? "이제 승급할 수 있어 멍!" : "함께 배워 가는 중이야 멍!");
        }

        internal bool Promote()
        {
            if (!CanPromote) return false;
            Grade = Grades[GradeIndex(Grade) + 1]; Xp -= PromotionCost;
            return true;
        }

        internal void Load(string[] settings)
        {
            Grade = "R"; Xp = 0; LastRewardUtc = DateTime.MinValue;
            var values = new Dictionary<string, string>();
            foreach (string line in settings)
            {
                int separator = line.IndexOf('=');
                if (separator > 0) values[line.Substring(0, separator)] = line.Substring(separator + 1);
            }
            string value;
            int xp;
            if (values.TryGetValue("grade", out value) && GradeIndex(value) >= 0) Grade = value;
            if (values.TryGetValue("xp", out value) && Int32.TryParse(value, out xp)) Xp = Math.Max(0, Math.Min(PromotionCost, xp));
            DateTime lastReward;
            if (values.TryGetValue("lastRewardUtc", out value) && DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out lastReward))
            {
                // A corrupt/future timestamp must not block care indefinitely.
                if (lastReward.Kind == DateTimeKind.Utc && lastReward <= DateTime.UtcNow.AddSeconds(CooldownSeconds)) LastRewardUtc = lastReward;
            }
            if (IsMax) Xp = 0;
        }

        internal string[] Save()
        {
            return new[] { "grade=" + Grade, "xp=" + Xp, "lastRewardUtc=" + LastRewardUtc.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture) };
        }
    }
}
