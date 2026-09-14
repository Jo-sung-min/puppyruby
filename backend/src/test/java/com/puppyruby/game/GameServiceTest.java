package com.puppyruby.game;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:puppy-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class GameServiceTest {
    @Autowired GameService game;
    @Autowired PlayerRepository repository;
    String player() { String id = UUID.randomUUID().toString(); game.state(id); return id; }
    GameService.Action action(String dogId) { return new GameService.Action(dogId, null, null, null, null); }
    GameService.Action command(String dogId, String value) { return new GameService.Action(dogId, value, null, null, null); }
    String puppyAtGrade(String playerId, Grade grade) {
        Player p = repository.findById(playerId).orElseThrow();
        p.puppies.getFirst().grade = grade; repository.save(p);
        return p.puppies.getFirst().id;
    }

    @Test void distributionBoundariesCoverExactlyOneHundredOutcomes() {
        var counts = new EnumMap<Grade, Integer>(Grade.class);
        for (int i = 0; i < 100; i++) counts.merge(Grade.fromRoll(i), 1, Integer::sum);
        for (Grade grade : Grade.values()) assertEquals(grade.probability, counts.get(grade));
        assertEquals(Grade.N, Grade.fromRoll(59)); assertEquals(Grade.R, Grade.fromRoll(60));
        assertEquals(Grade.SR, Grade.fromRoll(88)); assertEquals(Grade.SSR, Grade.fromRoll(98));
        assertThrows(IllegalArgumentException.class, () -> Grade.fromRoll(100));
    }
    @Test void heartAdoptionCannotBypassPaidTickets() {
        String id = player();
        var error = assertThrows(ResponseStatusException.class, () -> game.act(id, "adopt", action(null)));
        assertEquals(400, error.getStatusCode().value()); assertTrue(error.getReason().contains("뽑기권"));
        assertEquals(1000, game.state(id).coins()); assertEquals(1, game.state(id).puppies().size());
    }
    @Test void insufficientBalanceRollsBackAdoption() {
        String id = player(); Player p = repository.findById(id).orElseThrow(); p.coins = 99; repository.save(p);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "adopt", action(null)));
        assertEquals(99, game.state(id).coins()); assertEquals(1, game.state(id).puppies().size());
    }
    @Test void concurrentHeartAdoptionsAreBothBlocked() throws Exception {
        String id = player(); Player p = repository.findById(id).orElseThrow(); p.coins = 100; repository.save(p);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CountDownLatch(1);
            Callable<Boolean> draw = () -> { barrier.await(); try { game.act(id, "adopt", action(null)); return true; } catch (ResponseStatusException e) { return false; } };
            Future<Boolean> first = pool.submit(draw), second = pool.submit(draw); barrier.countDown();
            assertFalse(first.get(10, TimeUnit.SECONDS)); assertFalse(second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(100, game.state(id).coins()); assertEquals(1, game.state(id).puppies().size());
    }
    @Test void giftAndCareCannotBeClaimedRepeatedly() {
        String id = player(); String dogId = game.state(id).selectedId();
        game.act(id, "gift", action(null));
        assertThrows(ResponseStatusException.class, () -> game.act(id, "gift", action(null)));
        game.act(id, "feed", action(dogId));
        assertThrows(ResponseStatusException.class, () -> game.act(id, "feed", action(dogId)));
        assertEquals(1160, game.state(id).coins()); assertEquals(1, game.state(id).careCount());
        assertEquals(100, game.state(id).puppies().getFirst().hunger);
    }
    @Test void everyBreedCanGrowToHighestGrade() {
        for (int breed = 0; breed < GameService.BREEDS.size(); breed++) {
            String id = player(); Player p = repository.findById(id).orElseThrow();
            Puppy dog = p.puppies.getFirst(); dog.breed = breed; dog.grade = Grade.N; dog.xp = 300; repository.save(p);
            for (Grade expected : List.of(Grade.R, Grade.SR, Grade.SSR)) {
                var promoted = game.act(id, "promote", action(dog.id));
                assertEquals(expected, promoted.state().puppies().getFirst().grade);
            }
            assertEquals(0, game.state(id).puppies().getFirst().xp);
            assertThrows(ResponseStatusException.class, () -> game.act(id, "promote", action(dog.id)));
        }
    }
    @Test void insufficientExperienceAndForeignPuppiesAreRejected() {
        String first = player(), second = player();
        assertThrows(ResponseStatusException.class, () -> game.act(first, "promote", action(game.state(first).selectedId())));
        assertThrows(ResponseStatusException.class, () -> game.act(first, "feed", action(game.state(second).selectedId())));
        assertEquals(1000, game.state(first).coins());
    }
    @Test void appearanceAndNamePersistAndInvalidOptionsDoNotMutateState() {
        String id = player(), dogId = game.state(id).selectedId();
        game.act(id, "customize", new GameService.Action(dogId, null, "rose", "blue", "ribbon"));
        game.act(id, "rename", new GameService.Action(dogId, "복숭아", null, null, null));
        Puppy dog = game.state(id).puppies().getFirst();
        assertEquals("rose", dog.fur); assertEquals("blue", dog.eyes); assertEquals("ribbon", dog.accessory); assertEquals("복숭아", dog.name);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "customize", new GameService.Action(dogId, null, "hacked", "blue", "ribbon")));
        assertEquals("rose", game.state(id).puppies().getFirst().fur);
    }
    @Test void sharedPixelEyesPersistForEveryBreedAndRejectUnregisteredEyes() {
        String id = player(), dogId = game.state(id).selectedId();
        for (int number = 1; number <= 30; number++) {
            String eyes = "ruby-eye-%02d".formatted(number);
            Player player = repository.findById(id).orElseThrow();
            player.puppies.getFirst().breed = number - 1;
            repository.save(player);
            game.act(id, "customize", new GameService.Action(dogId, null, "original", eyes, "none"));
            assertEquals(eyes, game.state(id).puppies().getFirst().eyes);
        }
        for (String invalid : List.of("ruby-eye-00", "ruby-eye-31", "ruby-eye-1", "ruby-eye-030", "https://example.com/eye.png")) {
            assertThrows(ResponseStatusException.class, () -> game.act(id, "customize", new GameService.Action(dogId, null, "rose", invalid, "ribbon")));
            Puppy unchanged = game.state(id).puppies().getFirst();
            assertEquals("ruby-eye-30", unchanged.eyes);
            assertEquals("original", unchanged.fur);
            assertEquals("none", unchanged.accessory);
        }
    }
    @Test void trainingRespectsEnergyAndCooldownAndAwardsExperienceOnEitherOutcome() {
        String id = player(), dogId = game.state(id).selectedId();
        assertThrows(ResponseStatusException.class, () -> game.act(id, "train", action(dogId)));
        var input = new GameService.Action(dogId, "손", null, null, null);
        var result = game.act(id, "train", input);
        assertEquals(result.success() ? 20 : 5, result.state().puppies().getFirst().xp);
        assertEquals(result.success() ? 1010 : 1000, result.state().coins());
        assertEquals(85, result.state().puppies().getFirst().energy);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "train", input));
        Player p = repository.findById(id).orElseThrow(); p.puppies.getFirst().energy = 0; p.puppies.getFirst().lastTrain = 0; repository.save(p);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "train", input));
        assertEquals(1, game.state(id).trainingCount());
    }
    @Test void catalogAndTrainingGatesCoverEveryTier() {
        var expected = Map.of("앉아", Grade.N, "손", Grade.R, "기다려", Grade.SR, "돌아", Grade.SSR, "빵", Grade.SSR);
        var catalog = game.state(player()).commands();
        assertEquals(expected.size(), catalog.stream().filter(c -> c.kind().equals("training")).count());
        for (var entry : expected.entrySet()) {
            assertEquals(entry.getValue(), catalog.stream().filter(c -> c.label().equals(entry.getKey())).findFirst().orElseThrow().requiredGrade());
            for (Grade grade : Grade.values()) {
                String id = player(), dogId = puppyAtGrade(id, grade);
                if (grade.ordinal() < entry.getValue().ordinal()) {
                    var error = assertThrows(ResponseStatusException.class, () -> game.act(id, "train", command(dogId, entry.getKey())));
                    assertTrue(error.getReason().contains(entry.getValue().name()));
                    var unchanged = game.state(id);
                    assertEquals(0, unchanged.trainingCount()); assertEquals(0, unchanged.puppies().getFirst().xp);
                    assertEquals(90, unchanged.puppies().getFirst().energy); assertEquals(1000, unchanged.coins());
                } else {
                    var trained = game.act(id, "train", command(dogId, entry.getKey()));
                    assertEquals(1, trained.state().trainingCount());
                    assertEquals(85, trained.state().puppies().getFirst().energy);
                }
            }
        }
    }
    @Test void expandedBreedCatalogPreservesOldNumericMeaningAndAwardsAllThirtyBreeds() {
        assertEquals(30, BreedCatalog.ALL.size()); assertEquals(30, new HashSet<>(BreedCatalog.IDS).size());
        assertEquals(List.of("pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle"), BreedCatalog.IDS.subList(0, 6));
        assertEquals(List.of("포메라니안", "토이 푸들", "말티즈", "시바 이누", "웰시 코기", "비글"), GameService.BREEDS.subList(0, 6));
        assertEquals("samoyed", BreedCatalog.IDS.get(6)); assertEquals("dalmatian", BreedCatalog.IDS.get(16)); assertEquals("chowchow", BreedCatalog.IDS.get(29));
        String id = player(); String starter = game.state(id).selectedId();
        for (int breed = 0; breed < 30; breed++) {
            var awarded = game.awardPuppy(id, breed, Grade.R); var puppy = awarded.state().puppies().getLast();
            assertEquals(breed, puppy.breed); assertEquals(BreedCatalog.ALL.get(breed).puppyName(), puppy.name);
            assertEquals(puppy.id, awarded.newPuppyId()); assertEquals(Grade.R, puppy.grade); assertEquals(1000, awarded.state().coins());
        }
        var saved = game.state(id); assertEquals(31, saved.puppies().size()); assertEquals(starter, saved.puppies().getFirst().id);
        assertEquals(0, saved.puppies().getFirst().breed); assertEquals("루비", saved.puppies().getFirst().name);
        for (int invalid : List.of(-1, 30, Integer.MAX_VALUE)) assertThrows(ResponseStatusException.class, () -> game.awardPuppy(id, invalid, Grade.N));
        assertThrows(ResponseStatusException.class, () -> game.awardPuppy(id, 29, null)); assertEquals(31, game.state(id).puppies().size());
    }
    @Test void shortcutLookupIsOwnedGradeGatedAndNeverFarmsRewards() {
        String id = player(), dogId = puppyAtGrade(id, Grade.N), foreign = game.state(player()).selectedId();
        assertThrows(ResponseStatusException.class, () -> game.act(id, "ask", command(foreign, "엑셀 붙여넣기")));
        var lockedExcel = game.act(id, "ask", command(dogId, "엑셀 붙여넣기 단축키 알려줘"));
        assertFalse(lockedExcel.success()); assertTrue(lockedExcel.message().contains("R 등급"));
        puppyAtGrade(id, Grade.R);
        for (String prompt : List.of("엑셀 붙여넣기", "Excel 붙여넣기 단축키 알려줘!", "엑셀에서 붙여넣기 단축키가 뭐야?")) {
            var answered = game.act(id, "ask", command(dogId, prompt));
            assertTrue(answered.success(), prompt); assertTrue(answered.message().contains("Ctrl + V다 멍!"));
            assertEquals(1000, answered.state().coins()); assertEquals(0, answered.state().puppies().getFirst().xp);
            assertEquals(90, answered.state().puppies().getFirst().energy);
            assertEquals(0, answered.state().trainingCount()); assertEquals(0, answered.state().careCount());
        }
        var lockedHwp = game.act(id, "ask", command(dogId, "한글 붙여넣기"));
        assertFalse(lockedHwp.success()); assertTrue(lockedHwp.message().contains("SR 등급"));
        puppyAtGrade(id, Grade.SR);
        var hwp = game.act(id, "ask", command(dogId, "한글에서 붙여넣기는 어떻게 해?"));
        assertTrue(hwp.success()); assertTrue(hwp.message().startsWith("한글에서 붙여넣기는 Ctrl + V다 멍!"));
    }
    @Test void incompleteAmbiguousAndUnknownQuestionsNeverInventShortcuts() {
        String id = player(), dogId = puppyAtGrade(id, Grade.SSR);
        for (String prompt : List.of("붙여넣기", "엑셀 한글 붙여넣기", "엑셀 단축키 알려줘", "엑셀 붙여넣기 취소", "한글 강아지 산책", "")) {
            var answer = game.act(id, "ask", command(dogId, prompt));
            assertFalse(answer.success(), prompt); assertFalse(answer.message().contains("Ctrl +"), prompt);
            assertEquals(0, answer.state().puppies().getFirst().xp);
        }
    }
    @Test void everyShortcutUsesItsCatalogKeysOnlyAtItsRequiredTierOrAbove() {
        for (var entry : game.state(player()).commands()) {
            if (!entry.kind().equals("shortcut")) continue;
            String id = player();
            for (Grade grade : Grade.values()) {
                String dogId = puppyAtGrade(id, grade);
                var answer = game.act(id, "ask", command(dogId, entry.app() + " " + entry.label()));
                boolean unlocked = grade.ordinal() >= entry.requiredGrade().ordinal();
                assertEquals(unlocked, answer.success(), entry.id() + " at " + grade);
                if (unlocked) assertTrue(answer.message().contains(entry.keys() + "다 멍!"), entry.id());
                else assertTrue(answer.message().contains(entry.requiredGrade() + " 등급"), entry.id());
                assertEquals(0, answer.state().puppies().getFirst().xp);
                assertEquals(90, answer.state().puppies().getFirst().energy);
                assertEquals(1000, answer.state().coins());
            }
        }
    }
    @Test void trainingAcceptsCanonicalIdsAndAliasesWithoutBypassingGrades() {
        String id = player(), dogId = puppyAtGrade(id, Grade.N);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "train", command(dogId, "puppy-paw")));
        assertThrows(ResponseStatusException.class, () -> game.act(id, "train", command(dogId, "손 줘")));
        var trained = game.act(id, "train", command(dogId, "puppy-sit"));
        assertEquals(1, trained.state().trainingCount());
    }
    @Test void eachPromotionAnnouncesExactlyTheNewlyUnlockedAbilities() {
        String id = player(), dogId = puppyAtGrade(id, Grade.N);
        Player p = repository.findById(id).orElseThrow(); p.puppies.getFirst().xp = 300; repository.save(p);
        for (Grade next : List.of(Grade.R, Grade.SR, Grade.SSR)) {
            var result = game.act(id, "promote", action(dogId));
            assertTrue(result.message().contains("새로 배웠다 멍:"));
            for (var entry : result.state().commands()) {
                String display = entry.kind().equals("training") ? entry.label()
                    : (entry.app().equals("excel") ? "엑셀 " : "한글 ") + entry.label();
                if (entry.requiredGrade() == next) assertTrue(result.message().contains(display), display);
            }
            assertFalse(result.message().contains("앉아"));
        }
    }
}
