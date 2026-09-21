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
    public static final List<String> BREEDS = BreedCatalog.NAMES;
    private final PlayerRepository repository;
    private final CommandCatalog commands;
    private final AccessoryCatalog accessories;
    private final SecureRandom random = new SecureRandom();
    public GameService(PlayerRepository repository, CommandCatalog commands, AccessoryCatalog accessories) {
        this.repository = repository; this.commands = commands; this.accessories = accessories;
    }
    public record GradeInfo(String id, String label, int obedience, int probability) {}
    public record State(int coins, String selectedId, List<Puppy> puppies, boolean giftAvailable,
                        int careCount, int trainingCount, List<GradeInfo> grades, int adoptionCost, int promotionXp,
                        List<CommandCatalog.Command> commands) {}
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
            !today().equals(player.lastGiftDate), player.careCount, player.trainingCount, grades, ADOPTION_COST, PROMOTION_XP, commands.all());
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
            throw bad("새 가족은 상점의 강아지 뽑기권으로 만날 수 있어요.");
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
                    var command = commands.training(input.value()).orElseThrow(() -> bad("배울 명령을 선택해 주세요."));
                    if (!commands.unlocked(command, dog.grade)) throw bad(commands.lockedMessage(command));
                    cooldown(dog.lastTrain, now, 5);
                    if (dog.energy < 5) throw bad("훈련하기 전에 잠깐 쉬어 갈까요?");
                    dog.lastTrain = now; dog.energy -= 5; p.trainingCount++;
                    success = random.nextInt(100) < dog.grade.obedience;
                    dog.xp += success ? 20 : 5;
                    if (success) p.coins += 10;
                    message = success ? "척척! '" + command.label() + "' 성공! 경험치 +20, 하트 +10" : "갸우뚱… 아직 연습 중이에요. 그래도 경험치 +5!";
                }
                case "ask" -> {
                    var answer = commands.ask(input.value(), dog.grade);
                    message = answer.message(); success = answer.success();
                }
                case "promote" -> {
                    if (dog.grade == Grade.SSR) throw bad("이미 최고 등급이에요. 앞으로도 함께해요!");
                    if (dog.xp < PROMOTION_XP) throw bad("등급을 올리려면 경험치 100이 필요해요.");
                    dog.xp -= PROMOTION_XP; dog.grade = Grade.values()[dog.grade.ordinal() + 1];
                    message = dog.name + "가 " + dog.grade + " 등급이 되었어요! 새로 배웠다 멍: " + commands.newlyUnlocked(dog.grade);
                }
                case "customize" -> {
                    if (!CoatPaletteCatalog.contains(input.fur()) ||
                        !validEyes(input.eyes()) ||
                        !("none".equals(Objects.toString(input.accessory(), "")) || accessories.isFree(input.accessory())
                            || (input.accessory() != null && input.accessory().equals(dog.accessory))))
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

    static boolean validEyes(String eyes) {
        return eyes != null && (List.of("original", "blue", "green", "amber").contains(eyes)
            || eyes.matches("ruby-eye-(0[1-9]|[12][0-9]|30)"));
    }

    /** Only a server-side, already charged commerce draw calls this helper. */
    @Transactional
    public Result awardPuppy(String playerId, int breed, Grade grade) {
        if (breed < 0 || breed >= BREEDS.size() || grade == null) throw bad("강아지 보상 정보를 확인해 주세요.");
        Player player = player(playerId);
        if (player.puppies.size() >= 100) throw new ResponseStatusException(HttpStatus.CONFLICT, "우리 집은 최대 100마리까지 함께할 수 있어요. 뽑기권은 사용되지 않았어요.");
        Puppy puppy = new Puppy(BreedCatalog.ALL.get(breed).puppyName(), breed, grade);
        player.puppies.add(puppy); player.selectedId = puppy.id;
        repository.save(player);
        return new Result(view(player), puppy.name + "가 새로운 가족이 되었어요!", true, puppy.id);
    }

    /** Commerce checks inventory ownership before calling this internal helper in the same transaction. */
    @Transactional
    public Result equipOwnedCosmetic(String playerId, String puppyId, String kind, String itemId) {
        if (itemId == null) throw bad("사용할 수 없는 꾸미기 아이템이에요.");
        boolean valid = "aura".equals(kind) && ("none".equals(itemId) || com.puppyruby.commerce.CommerceDefinitions.AURAS.contains(itemId))
            || "accessory".equals(kind) && ("none".equals(itemId) || accessories.isPaid(itemId));
        if (!valid) throw bad("사용할 수 없는 꾸미기 아이템이에요.");
        Player player = player(playerId); Puppy puppy = puppy(player, puppyId);
        if (kind.equals("aura")) puppy.aura = itemId; else puppy.accessory = itemId;
        repository.save(player);
        return new Result(view(player), "none".equals(itemId) ? "장식을 해제했어요." : "보유한 장식을 착용했어요!", true, null);
    }
}
