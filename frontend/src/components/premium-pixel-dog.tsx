import { premiumDogAsset, premiumDogCatalog, type PremiumDogStyleId } from "../lib/premium-dog-styles";
import { MasterArtPixelDog, type MasterArtReactionProps } from "./master-art-pixel-dog";

export function PremiumPixelDog({ styleId, ...reactions }: MasterArtReactionProps & { styleId: PremiumDogStyleId }) {
  const asset = premiumDogAsset(styleId);
  if (!asset) return null;
  const name = premiumDogCatalog.find(style => style.id === styleId)!.name;
  return <MasterArtPixelDog {...reactions} styleId={styleId} png={asset.png} name={`${name} 고급 도트 강아지`} styleClass="dog-style-premium" />;
}
