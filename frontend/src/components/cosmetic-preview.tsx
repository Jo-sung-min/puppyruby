import { PuppySprite } from "./puppy-sprite";

export function CosmeticPreview({ kind, itemId, breed = 0 }: { kind: "aura" | "accessory"; itemId: string; breed?: number }) {
  return <PuppySprite puppy={{ breed, aura: kind === "aura" ? itemId : "none", accessory: kind === "accessory" ? itemId : "none" }} decorative />;
}
