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

    @Test void distributionBoundariesCoverExactlyOneHundredOutcomes() {
        var counts = new EnumMap<Grade, Integer>(Grade.class);
        for (int i = 0; i < 100; i++) counts.merge(Grade.fromRoll(i), 1, Integer::sum);
        for (Grade grade : Grade.values()) assertEquals(grade.probability, counts.get(grade));
        assertEquals(Grade.N, Grade.fromRoll(59)); assertEquals(Grade.R, Grade.fromRoll(60));
        assertEquals(Grade.SR, Grade.fromRoll(88)); assertEquals(Grade.SSR, Grade.fromRoll(98));
        assertThrows(IllegalArgumentException.class, () -> Grade.fromRoll(100));
    }
    @Test void adoptionChargesExactlyOnceAndPersistsNewFamily() {
        String id = player();
        var result = game.act(id, "adopt", action(null));
        assertEquals(900, result.state().coins()); assertEquals(2, result.state().puppies().size());
        assertEquals(result.newPuppyId(), game.state(id).selectedId());
        assertNotEquals(result.state().puppies().get(0).id, result.newPuppyId());
        assertNotNull(result.state().puppies().get(1).grade);
    }
    @Test void insufficientBalanceRollsBackAdoption() {
        String id = player(); Player p = repository.findById(id).orElseThrow(); p.coins = 99; repository.save(p);
        assertThrows(ResponseStatusException.class, () -> game.act(id, "adopt", action(null)));
        assertEquals(99, game.state(id).coins()); assertEquals(1, game.state(id).puppies().size());
    }
    @Test void concurrentAdoptionsCannotOverspend() throws Exception {
        String id = player(); Player p = repository.findById(id).orElseThrow(); p.coins = 100; repository.save(p);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CountDownLatch(1);
            Callable<Boolean> draw = () -> { barrier.await(); try { game.act(id, "adopt", action(null)); return true; } catch (ResponseStatusException e) { return false; } };
            Future<Boolean> first = pool.submit(draw), second = pool.submit(draw); barrier.countDown();
            assertNotEquals(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(0, game.state(id).coins()); assertEquals(2, game.state(id).puppies().size());
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
        for (int breed = 0; breed < 6; breed++) {
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
}
