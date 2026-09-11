package com.puppyruby.game;

import jakarta.persistence.*;
import java.util.UUID;

@Embeddable
public class Puppy {
    public String id;
    public String name;
    public int breed;
    @Enumerated(EnumType.STRING) public Grade grade;
    public int xp;
    public int hunger;
    public int happiness;
    public int energy;
    public String fur;
    public String eyes;
    public String accessory;
    public long lastFeed;
    public long lastPlay;
    public long lastRest;
    public long lastTrain;
    protected Puppy() {}
    Puppy(String name, int breed, Grade grade) {
        this.id = UUID.randomUUID().toString(); this.name = name; this.breed = breed; this.grade = grade;
        hunger = 80; happiness = 85; energy = 90;
        fur = "original"; eyes = "original"; accessory = "none";
    }
}
