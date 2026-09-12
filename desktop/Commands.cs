using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace PuppyRubyDesktop
{
    internal sealed class PuppyCommand
    {
        public string id { get; set; }
        public string kind { get; set; }
        public string app { get; set; }
        public string label { get; set; }
        public string requiredGrade { get; set; }
        public string keys { get; set; }
        public string[] aliases { get; set; }
        public string context { get; set; }
        public string sourceUrl { get; set; }
    }

    internal sealed class CommandReply
    {
        internal string Status;
        internal string Bubble;
        internal string Detail;
        internal PuppyCommand Command;
    }

    internal sealed class CommandCatalog
    {
        internal readonly PuppyCommand[] Commands;
        internal CommandCatalog(PuppyCommand[] commands) { Commands = commands; }

        internal static CommandCatalog Load()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("commands.json"))
            {
                if (stream == null) throw new InvalidDataException("강아지 명령 사전을 찾을 수 없어요.");
                using (StreamReader reader = new StreamReader(stream))
                {
                    PuppyCommand[] commands = new JavaScriptSerializer().Deserialize<PuppyCommand[]>(reader.ReadToEnd());
                    if (commands == null || commands.Length == 0) throw new InvalidDataException("강아지 명령 사전이 비어 있어요.");
                    foreach (PuppyCommand command in commands)
                        if (command == null || String.IsNullOrEmpty(command.id) || String.IsNullOrEmpty(command.label) ||
                            Progression.GradeIndex(command.requiredGrade) < 0 ||
                            (command.kind != "training" && command.kind != "shortcut") ||
                            (command.app != "puppy" && command.app != "excel" && command.app != "hwp"))
                            throw new InvalidDataException("강아지 명령 사전 형식이 올바르지 않아요.");
                    return new CommandCatalog(commands);
                }
            }
        }

        internal static string AppName(string app)
        {
            return app == "excel" ? "엑셀" : app == "hwp" ? "한글" : app == "puppy" ? "훈련" : "자동 선택";
        }

        internal static string Normalize(string text)
        {
            return Regex.Replace((text ?? "").ToLowerInvariant(), @"[\s?？!！.,，。]+", "").Trim();
        }

        private static string StripQueryWords(string text)
        {
            string value = text;
            string[] words = { "단축키가뭐야", "단축키뭐야", "단축키알려주세요", "단축키알려줘", "단축키는", "단축키", "하는방법", "어떻게해", "알려주세요", "알려줘", "뭐야" };
            foreach (string word in words) value = value.Replace(word, "");
            return value;
        }

        private static string StripAppNames(string value)
        {
            return Regex.Replace(value, "(엑셀|excel|한글|hwp)(에서|의|용)?", "");
        }

        internal CommandReply Resolve(string query, string selectedApp, string grade)
        {
            string normalized = Normalize(query);
            if (normalized.Length == 0) return Reply("empty", "무엇이 궁금하멍?", "예: ‘엑셀 붙여넣기 단축키’, ‘한글 저장’, ‘앉아’처럼 물어봐 줘 멍!");
            bool excel = normalized.Contains("엑셀") || normalized.Contains("excel");
            bool hwp = normalized.Contains("한글") || normalized.Contains("hwp");
            if (excel && hwp) return Reply("ambiguous", "앱 하나씩 알려 줘 멍!", "엑셀과 한글은 단축키가 다를 수 있어. 앱 하나를 선택해서 물어봐 줘 멍!");
            string inferred = excel ? "excel" : hwp ? "hwp" : null;
            if (!String.IsNullOrEmpty(selectedApp) && selectedApp != "auto" && inferred != null && selectedApp != inferred)
                return Reply("ambiguous", "선택한 앱을 확인해 줘 멍!", "선택한 앱과 질문의 앱이 달라. 같은 앱으로 맞춰 줘 멍!");
            string app = inferred ?? (selectedApp == "auto" ? null : selectedApp);
            string operation = StripQueryWords(StripAppNames(normalized));
            var matches = new List<PuppyCommand>();
            foreach (PuppyCommand command in Commands)
            {
                if (!String.IsNullOrEmpty(app) && command.app != app) continue;
                bool match = operation == Normalize(command.label);
                if (command.aliases != null) foreach (string alias in command.aliases)
                    if (operation == StripQueryWords(StripAppNames(Normalize(alias)))) match = true;
                if (match) matches.Add(command);
            }
            if (matches.Count == 0) return Reply("unknown", "아직 모르는 명령이야 멍!", "정확히 등록된 명령을 찾지 못했어. 아래 명령 목록에서 골라 줘 멍! 단축키를 추측해서 알려 주지는 않아.");
            if (matches.Count > 1) return Reply("ambiguous", "어느 앱인지 알려 줘 멍!", "여러 명령이 있어. 앱을 선택하고 목록의 정확한 이름으로 물어봐 줘 멍!");
            PuppyCommand found = matches[0];
            if (Progression.GradeIndex(grade) < Progression.GradeIndex(found.requiredGrade))
            {
                CommandReply locked = Reply("locked", found.requiredGrade + " 등급에 배울 수 있어 멍!", "‘" + found.label + "’은 " + found.requiredGrade + " 등급부터 할 수 있어 멍! 훈련이나 돌봄으로 경험치를 모아 승급해 줘.");
                locked.Command = found; return locked;
            }
            string bubble = found.kind == "shortcut" ? found.keys + "다 멍!" : "‘" + found.label + "’ 해 볼게 멍!";
            CommandReply answer = Reply("success", bubble, bubble + "\r\n" + AppName(found.app) + " · " + found.label + "\r\n" + (found.context ?? ""));
            answer.Command = found;
            return answer;
        }

        internal CommandReply Execute(string query, string app, Progression progress, DateTime now)
        {
            CommandReply reply = Resolve(query, app, progress.Grade);
            if (reply.Status == "success" && reply.Command.kind == "training")
                reply.Detail += "\r\n" + progress.RewardActivity(now);
            return reply;
        }

        private static CommandReply Reply(string status, string bubble, string detail)
        {
            return new CommandReply { Status = status, Bubble = bubble, Detail = detail };
        }
    }
}
