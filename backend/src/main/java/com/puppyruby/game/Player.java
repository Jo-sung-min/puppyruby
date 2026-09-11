package com.puppyruby.game;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "players")
public class Player {
    @Id public String id;
    public int coins;
    public String selectedId;
    public LocalDate lastGiftDate;
    public int careCount;
    public int trainingCount;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "puppies", joinColumns = @JoinColumn(name = "player_id"))
    @OrderColumn(name = "puppy_order")
    public List<Puppy> puppies = new ArrayList<>();
    protected Player() {}
    Player(String id) {
        this.id = id; coins = 1000;
        Puppy ruby = new Puppy("루비", 0, Grade.R);
        puppies.add(ruby); selectedId = ruby.id;
    }
}
