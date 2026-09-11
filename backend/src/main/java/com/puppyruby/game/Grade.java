package com.puppyruby.game;

public enum Grade {
    N(45, 60, "소중한 친구"), R(65, 28, "특별한 친구"), SR(80, 10, "빛나는 친구"), SSR(95, 2, "운명의 친구");
    public final int obedience;
    public final int probability;
    public final String label;
    Grade(int obedience, int probability, String label) {
        this.obedience = obedience; this.probability = probability; this.label = label;
    }
    public static Grade fromRoll(int roll) {
        if (roll < 0 || roll >= 100) throw new IllegalArgumentException("0–99 범위가 필요합니다.");
        int cumulative = 0;
        for (Grade grade : values()) {
            cumulative += grade.probability;
            if (roll < cumulative) return grade;
        }
        throw new IllegalStateException("등급 확률 합계 오류");
    }
}
