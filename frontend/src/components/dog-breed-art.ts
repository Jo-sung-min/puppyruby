import type { PixelBreed } from "../lib/dog-breeds";

export type BreedArt = {
  ears?: "point" | "drop" | "bat" | "fold" | "round";
  headWidth?: number; headHeight?: number; bodyWidth?: number; bodyHeight?: number;
  earWidth?: number; earLength?: number; earHeight?: number; earShade?: number;
  fluff?: number; tuftSize?: number; muzzle?: number; eyeScale?: number;
  marking?: "mask" | "blaze" | "blacktan" | "spots" | "eyepatch" | "tuxedo" | "saddle";
  detail?: "feathers" | "topknot" | "beard" | "eyebrows" | "wrinkles" | "wisps";
  tongue?: string;
};

// Geometry and natural markings are independent of coat/style choices. Values
// scale each style's own head/body rather than replacing the chosen artwork.
export const breedArt: Partial<Record<PixelBreed, BreedArt>> = {
  bichon: { ears:"drop", headWidth:1.04, headHeight:1.06, earWidth:4, earLength:.5, fluff:16, tuftSize:4, muzzle:.9, bodyWidth:.95 },
  golden: { ears:"drop", headWidth:1.01, headHeight:.98, earWidth:6, earLength:.95, earShade:.15, bodyWidth:1.12, detail:"feathers", muzzle:1.04 },
  labrador: { ears:"drop", headWidth:1.07, headHeight:.95, earWidth:7, earLength:.72, earShade:.08, bodyWidth:1.16, muzzle:1.12 },
  husky: { ears:"point", headWidth:.96, headHeight:1.04, earWidth:6, earHeight:8, marking:"mask", muzzle:1.05 },
  shihtzu: { ears:"drop", headWidth:1.04, headHeight:.93, earWidth:6, earLength:.82, fluff:8, tuftSize:2, marking:"blaze", detail:"topknot", muzzle:1.1 },
  frenchbulldog: { ears:"bat", headWidth:1.03, headHeight:.94, earWidth:7, earHeight:10, marking:"eyepatch", bodyWidth:1.12, muzzle:1.18 },
  dachshund: { ears:"drop", headWidth:.93, headHeight:.88, earWidth:7, earLength:.95, earShade:.25, bodyWidth:1.5, bodyHeight:.74, marking:"blacktan", muzzle:.95 },
  schnauzer: { ears:"fold", headWidth:.92, headHeight:1.04, earWidth:7, earHeight:3, detail:"beard", muzzle:1.18, bodyHeight:1.05 },
  chihuahua: { ears:"bat", headWidth:.86, headHeight:.97, earWidth:8, earHeight:8, bodyWidth:.78, bodyHeight:.86, muzzle:.78, eyeScale:1.2 },
  dalmatian: { ears:"drop", headWidth:.98, headHeight:.98, earWidth:6, earLength:.68, earShade:.2, marking:"spots", bodyHeight:1.12 },
  akita: { ears:"point", headWidth:1.07, headHeight:1.03, earWidth:7, earHeight:6, muzzle:1.17, bodyWidth:1.16, marking:"mask" },
  bordercollie: { ears:"point", headWidth:1.02, headHeight:.99, earWidth:7, earHeight:6, fluff:10, tuftSize:2, marking:"tuxedo", muzzle:1.02 },
  doberman: { ears:"point", headWidth:.84, headHeight:1.1, earWidth:5, earHeight:12, marking:"blacktan", bodyWidth:.9, bodyHeight:1.12, muzzle:.88 },
  rottweiler: { ears:"drop", headWidth:1.09, headHeight:.94, earWidth:7, earLength:.63, marking:"blacktan", bodyWidth:1.18, muzzle:1.19 },
  greatdane: { ears:"drop", headWidth:.9, headHeight:1.14, earWidth:6, earLength:.66, bodyWidth:.95, bodyHeight:1.2, muzzle:.88, detail:"wrinkles" },
  saintbernard: { ears:"drop", headWidth:1.1, headHeight:1.03, earWidth:7, earLength:.8, earShade:.38, marking:"saddle", bodyWidth:1.2, muzzle:1.17 },
  bassethound: { ears:"drop", headWidth:.94, headHeight:.9, earWidth:6, earLength:1.28, earShade:.12, marking:"blaze", bodyWidth:1.32, bodyHeight:.77, detail:"eyebrows", muzzle:1.02 },
  englishbulldog: { ears:"fold", headWidth:1.09, headHeight:.87, earWidth:6, earHeight:2, marking:"blaze", detail:"wrinkles", muzzle:1.24, bodyWidth:1.2 },
  westie: { ears:"point", headWidth:1.01, headHeight:.94, earWidth:7, earHeight:8, fluff:12, tuftSize:2, detail:"wisps", muzzle:1.06, bodyWidth:.96 },
  bostonterrier: { ears:"bat", headWidth:.92, headHeight:1.04, earWidth:6, earHeight:11, marking:"tuxedo", bodyWidth:.9, muzzle:1.06 },
  yorkshireterrier: { ears:"drop", headWidth:.88, headHeight:.94, earWidth:5, earLength:.67, fluff:8, tuftSize:2, marking:"saddle", detail:"topknot", bodyWidth:.82, muzzle:.9 },
  pekingese: { ears:"drop", headWidth:1.09, headHeight:.87, earWidth:5, earLength:.96, fluff:10, tuftSize:2, detail:"wisps", muzzle:1.22, bodyWidth:1.03, bodyHeight:.85 },
  chowchow: { ears:"round", headWidth:1.06, headHeight:1.04, earWidth:4, earHeight:1, fluff:14, tuftSize:4, muzzle:1.15, bodyWidth:1.14, tongue:"#8580bf" },
};
