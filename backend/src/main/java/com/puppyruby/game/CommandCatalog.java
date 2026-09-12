package com.puppyruby.game;

import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
import java.util.stream.Collectors;

@Component
public class CommandCatalog {
    public record Command(String id, String kind, String app, String label, Grade requiredGrade,
                          String keys, List<String> aliases, String context, String sourceUrl) {}
    public record Answer(String message, boolean success) {}
    private final List<Command> commands;

    public CommandCatalog(ObjectMapper mapper) {
        try (var source = CommandCatalog.class.getResourceAsStream("/commands.json")) {
            if (source == null) throw new IllegalStateException("공유 명령 목록 commands.json이 없습니다.");
            commands = List.copyOf(Arrays.asList(mapper.readValue(source, Command[].class)));
            if (commands.isEmpty() || commands.stream().map(Command::id).distinct().count() != commands.size())
                throw new IllegalStateException("공유 명령 목록이 비어 있거나 ID가 중복되었습니다.");
        } catch (IOException error) {
            throw new IllegalStateException("공유 명령 목록을 읽을 수 없습니다.", error);
        }
    }

    public List<Command> all() { return commands; }

    public Optional<Command> training(String value) {
        String query = normalize(value);
        return commands.stream().filter(command -> command.kind().equals("training"))
            .filter(command -> normalize(command.id()).equals(query) || matches(command, query)).findFirst();
    }

    public boolean unlocked(Command command, Grade grade) {
        return grade.ordinal() >= command.requiredGrade().ordinal();
    }

    public String lockedMessage(Command command) {
        return displayName(command) + topicParticle(command.label()) + " " + command.requiredGrade() + " 등급부터 할 수 있다 멍! 돌봄과 훈련으로 함께 성장하자 멍!";
    }

    public String newlyUnlocked(Grade grade) {
        return commands.stream().filter(command -> command.requiredGrade() == grade)
            .map(CommandCatalog::displayName).collect(Collectors.joining(", "));
    }

    public Answer ask(String value, Grade grade) {
        String prompt = normalize(value);
        if (prompt.isEmpty()) return new Answer("궁금한 작업을 말해 줘 멍! 예: 엑셀 붙여넣기 단축키", false);
        if (prompt.length() > 200) return new Answer("한 번에 한 가지 작업을 짧게 물어봐 줘 멍!", false);
        boolean excel = prompt.contains("엑셀") || prompt.contains("excel");
        boolean hwp = prompt.contains("한글") || prompt.contains("hwp") || prompt.contains("한컴");
        if (excel == hwp) {
            return new Answer(excel ? "엑셀과 한글 중 어떤 프로그램인지 하나만 골라 줘 멍!"
                : "어떤 프로그램의 단축키인지 알려 줘 멍! 예: 엑셀 붙여넣기 / 한글 붙여넣기", false);
        }
        String app = excel ? "excel" : "hwp";
        String query = operation(prompt);
        if (query.isEmpty()) return new Answer(appName(app) + "에서 어떤 작업이 궁금해 멍? 예: 붙여넣기, 복사, 저장", false);
        var matching = commands.stream().filter(command -> command.kind().equals("shortcut") && command.app().equals(app))
            .filter(command -> matches(command, query)).toList();
        if (matching.size() > 1) {
            return new Answer("어떤 작업인지 더 정확히 말해 줘 멍! "
                + matching.stream().map(Command::label).distinct().collect(Collectors.joining(", ")), false);
        }
        if (matching.isEmpty()) return new Answer("아직 그 단축키는 배우지 못했다 멍! 명령 목록에서 작업을 골라 줘 멍.", false);
        Command command = matching.getFirst();
        if (!unlocked(command, grade)) return new Answer(lockedMessage(command), false);
        String context = command.context() == null || command.context().isBlank() ? "" : " " + command.context();
        return new Answer(appName(app) + "에서 " + command.label() + topicParticle(command.label()) + " " + command.keys() + "다 멍!" + context, true);
    }

    private static boolean matches(Command command, String query) {
        return normalize(command.label()).equals(query)
            || command.aliases().stream().map(CommandCatalog::normalize).anyMatch(query::equals);
    }

    private static String operation(String prompt) {
        String query = prompt.replaceAll("(?:엑셀|excel|한컴오피스한글|한컴한글|한글|hwp|한컴)(?:에서는|에서|의|용|은|는)?", "");
        // Strip only conversational framing; the remaining operation must exactly match a catalog entry.
        query = query.replaceAll("^(?:루비야|강아지야|혹시|제발)", "");
        String previous;
        do {
            previous = query;
            query = query.replaceAll("(?:알려주세요|알려줘요|알려줘|가르쳐주세요|가르쳐줘|부탁해|단축키|단축키는|단축키가|뭐야|뭐예요|뭔가요|뭐에요|무엇인가요|어떻게해|어떻게|하는법|하는방법|할때|은|는|이|가|을|를|좀|요)$", "");
        } while (!query.equals(previous));
        return query;
    }

    private static String normalize(String value) {
        return Normalizer.normalize(Objects.toString(value, ""), Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}\\p{P}]+", "");
    }

    private static String appName(String app) { return app.equals("excel") ? "엑셀" : "한글"; }
    private static String topicParticle(String label) {
        int last = label.codePointBefore(label.length());
        return last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 != 0 ? "은" : "는";
    }
    private static String displayName(Command command) {
        return command.kind().equals("training") ? command.label() : appName(command.app()) + " " + command.label();
    }
}
