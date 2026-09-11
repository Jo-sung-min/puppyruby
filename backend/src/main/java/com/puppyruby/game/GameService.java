package com.puppyruby.game;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;

@Service
public class GameService {
    public static final int ADOPTION_COST = 100;
    public static final int PROMOTION_XP = 100;
    public static final List<String> BREEDS = List.of("포메라니안", "토이 푸들", "말티즈", "시바 이누", "웰시 코기", "비글");
    private static final List<String> NAMES = List.of("솜이", "모카", "구름", "두부", "감자", "쿠키");
    private final PlayerRepository repository;
    private final SecureRandom random = new SecureRandom();
    public GameService(PlayerRepository repository) { this.repository = repository; }
    public record GradeInfo(String id, String label, int obedience, int probability) {}
    public record State(int coins, String selectedId, List<Puppy> puppies, boolean giftAvailable,
                        int careCount, int trainingCount, List<GradeInfo> grades, int adoptionCost, int promotionXp) {}
    public record Result(State state, String message, boolean success, String newPuppyId) {}
    public record Action(String puppyId, String value, String fur, String eyes, String accessory) {}

    @Transactional
    public State state(String playerId) { return view(player(playerId)); }

    private Player player(String id) {
        try { UUID.fromString(id); } catch (RuntimeException error) { throw bad("잘못된 방문 정보입니다."); }
        return repository.findLocked(id).orElseGet(() -> repository.saveAndFlush(new Player(id)));
    }
    private State view(Player player) {
        var grades = Arrays.stream(Grade.values()).map(g -> new GradeInfo(g.name(), g.label, g.obedience, g.probability)).toList();
        return new State(player.coins, player.selectedId, List.copyOf(player.puppies),
            !today().equals(player.lastGiftDate), player.careCount, player.trainingCount, grades, ADOPTION_COST, PROMOTION_XP);
    }
    private LocalDate today() { return LocalDate.now(ZoneId.of("Asia/Seoul")); }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private Puppy puppy(Player p, String id) {
        return p.puppies.stream().filter(d -> d.id.equals(id)).findFirst().orElseThrow(() -> bad("우리 집 강아지를 선택해 주세요."));
    }
    private void cooldown(long previous, long now, int seconds) {
        long remaining = seconds - (now - previous) / 1000;
        if (remaining > 0) throw bad(remaining + "초 후에 다시 함께해 주세요.");
    }
    @Transactional
    public Result act(String playerId, String action, Action input) {
        Player p = player(playerId);
        String message;
        boolean success = true;
        String newId = null;
        long now = System.currentTimeMillis();
        if (action.equals("adopt")) {
            if (p.coins < ADOPTION_COST) throw bad("하트가 부족해요. 돌봄이나 오늘의 선물로 모아 보세요.");
            if (p.puppies.size() >= 100) throw bad("우리 집은 최대 100마리까지 함께할 수 있어요.");
            int breed = random.nextInt(BREEDS.size());
            Puppy dog = new Puppy(NAMES.get(breed), breed, Grade.fromRoll(random.nextInt(100)));
            p.coins -= ADOPTION_COST; p.puppies.add(dog); p.selectedId = dog.id; newId = dog.id;
            message = dog.name + "가 새로운 가족이 되었어요!";
        } else if (action.equals("gift")) {
            if (today().equals(p.lastGiftDate)) throw bad("오늘의 선물은 이미 받았어요. 내일 또 만나요!");
            p.lastGiftDate = today(); p.coins += 150; message = "오늘의 선물, 하트 150개를 받았어요!";
        } else {
            Puppy dog = puppy(p, input.puppyId());
            switch (action) {
                case "select" -> { p.selectedId = dog.id; message = dog.name + "와 함께하는 시간"; }
                case "feed" -> {
                    cooldown(dog.lastFeed, now, 30); dog.lastFeed = now;
                    dog.hunger = Math.min(100, dog.hunger + 20); dog.happiness = Math.min(100, dog.happiness + 5);
                    dog.xp += 10; p.coins += 10; p.careCount++; message = "냠냠! " + dog.name + "가 맛있게 먹었어요. 하트 +10";
                }
                case "play" -> {
                    cooldown(dog.lastPlay, now, 30);
                    if (dog.energy < 10) throw bad("조금 피곤해요. 먼저 쉬게 해 주세요.");
                    dog.lastPlay = now; dog.energy -= 10; dog.hunger = Math.max(0, dog.hunger - 5);
                    dog.happiness = Math.min(100, dog.happiness + 20); dog.xp += 15; p.coins += 15; p.careCount++;
                    message = "꼬리 살랑살랑, 같이 노니까 정말 좋아! 하트 +15";
                }
                case "rest" -> {
                    cooldown(dog.lastRest, now, 30); dog.lastRest = now; dog.energy = Math.min(100, dog.energy + 30);
                    dog.xp += 5; p.coins += 5; p.careCount++; message = "포근하게 쉬고 기운을 되찾았어요. 하트 +5";
                }
                case "train" -> {
                    if (!List.of("앉아", "손", "기다려").contains(Objects.toString(input.value(), ""))) throw bad("배울 명령을 선택해 주세요.");
                    cooldown(dog.lastTrain, now, 5);
                    if (dog.energy < 5) throw bad("훈련하기 전에 잠깐 쉬어 갈까요?");
                    dog.lastTrain = now; dog.energy -= 5; p.trainingCount++;
                    success = random.nextInt(100) < dog.grade.obedience;
                    dog.xp += success ? 20 : 5;
                    if (success) p.coins += 10;
                    message = success ? "척척! '" + input.value() + "' 성공! 경험치 +20, 하트 +10" : "갸우뚱… 아직 연습 중이에요. 그래도 경험치 +5!";
                }
                case "promote" -> {
                    if (dog.grade == Grade.SSR) throw bad("이미 최고 등급이에요. 앞으로도 함께해요!");
                    if (dog.xp < PROMOTION_XP) throw bad("등급을 올리려면 경험치 100이 필요해요.");
                    dog.xp -= PROMOTION_XP; dog.grade = Grade.values()[dog.grade.ordinal() + 1];
                    message = dog.name + "가 " + dog.grade + " 등급이 되었어요!";
                }
                case "customize" -> {
                    if (!List.of("original", "cream", "chocolate", "rose", "silver").contains(Objects.toString(input.fur(), "")) ||
                        !List.of("original", "blue", "green", "amber").contains(Objects.toString(input.eyes(), "")) ||
                        !List.of("none", "ribbon", "scarf", "crown").contains(Objects.toString(input.accessory(), "")))
                        throw bad("사용할 수 없는 꾸미기 아이템이에요.");
                    dog.fur = input.fur(); dog.eyes = input.eyes(); dog.accessory = input.accessory();
                    message = "찰떡같이 어울려요! " + dog.name + "의 꾸미기를 저장했어요.";
                }
                case "rename" -> {
                    String name = Objects.toString(input.value(), "").strip();
                    if (name.isEmpty() || name.codePointCount(0, name.length()) > 12 || name.codePoints().anyMatch(Character::isISOControl))
                        throw bad("이름은 1~12자로 지어 주세요.");
                    dog.name = name; message = "이제 " + name + "라고 불러 주세요!";
                }
                default -> throw bad("지원하지 않는 동작이에요.");
            }
        }
        repository.save(p);
        return new Result(view(p), message, success, newId);
    }
}
