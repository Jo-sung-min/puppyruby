package com.puppyruby.game;

import java.util.List;

/** Append-only order: a puppy's persisted numeric breed is its index in this list. */
public final class BreedCatalog {
    private BreedCatalog() {}
    public record Breed(String id, String name, String puppyName) {}
    public static final int LEGACY_DRAW_BREED_COUNT = 6;
    public static final List<Breed> ALL = List.of(
        new Breed("pomeranian", "포메라니안", "솜이"),
        new Breed("poodle", "토이 푸들", "모카"),
        new Breed("maltese", "말티즈", "구름"),
        new Breed("shiba", "시바 이누", "두부"),
        new Breed("corgi", "웰시 코기", "감자"),
        new Breed("beagle", "비글", "쿠키"),
        new Breed("samoyed", "사모예드", "설이"),
        new Breed("bichon", "비숑 프리제", "몽실"),
        new Breed("golden", "골든 리트리버", "골디"),
        new Breed("labrador", "래브라도 리트리버", "콩이"),
        new Breed("husky", "시베리안 허스키", "하울"),
        new Breed("shihtzu", "시추", "뭉치"),
        new Breed("frenchbulldog", "프렌치 불도그", "봉봉"),
        new Breed("dachshund", "닥스훈트", "단추"),
        new Breed("schnauzer", "미니어처 슈나우저", "수염"),
        new Breed("chihuahua", "치와와", "쪼꼬"),
        new Breed("dalmatian", "달마시안", "점박"),
        new Breed("akita", "아키타", "아키"),
        new Breed("bordercollie", "보더콜리", "보리"),
        new Breed("doberman", "도베르만", "듀크"),
        new Breed("rottweiler", "로트와일러", "로키"),
        new Breed("greatdane", "그레이트 데인", "대니"),
        new Breed("saintbernard", "세인트 버나드", "버니"),
        new Breed("bassethound", "바셋 하운드", "바비"),
        new Breed("englishbulldog", "잉글리시 불도그", "불리"),
        new Breed("westie", "웨스트 하이랜드 화이트 테리어", "하양"),
        new Breed("bostonterrier", "보스턴 테리어", "토니"),
        new Breed("yorkshireterrier", "요크셔 테리어", "요키"),
        new Breed("pekingese", "페키니즈", "페키"),
        new Breed("chowchow", "차우차우", "차차")
    );
    public static final List<String> IDS = ALL.stream().map(Breed::id).toList();
    public static final List<String> NAMES = ALL.stream().map(Breed::name).toList();
}
