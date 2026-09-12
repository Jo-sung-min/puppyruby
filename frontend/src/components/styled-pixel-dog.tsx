"use client";

import type { ComponentProps } from "react";
import { resolveDogStyle } from "@/lib/dog-styles";
import { PixelDog as DogArt } from "./pixel-dog";
import { useDogAppearance } from "./dog-appearance-provider";

export { pixelBreeds, type PixelBreed, type PixelMood } from "./pixel-dog";

/** The renderer remains pure for previews and native exports; live pages share server settings. */
export function PixelDog(props: ComponentProps<typeof DogArt>) {
  const config = useDogAppearance();
  return <DogArt {...props} styleId={props.styleId ?? resolveDogStyle(config, props.breed ?? "shiba")} />;
}
