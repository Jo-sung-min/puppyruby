import { originalArtDogAsset, originalArtDogCatalog, type OriginalArtDogStyleId } from "../lib/original-art-dog-styles";
import { MasterArtPixelDog, type MasterArtReactionProps } from "./master-art-pixel-dog";

export function OriginalArtPixelDog({ styleId, ...reactions }: MasterArtReactionProps & { styleId: OriginalArtDogStyleId }) {
  const asset = originalArtDogAsset(styleId);
  const style = originalArtDogCatalog.find(item => item.id === styleId);
  if (!asset || !style) return null;
  return <MasterArtPixelDog {...reactions} styleId={styleId} png={asset.png} name={`${style.name} 픽셀아트 강아지`} styleClass="dog-style-original-art" />;
}
