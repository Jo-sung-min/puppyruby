import { art16AccessoryPlacement } from "../lib/art16-accessories";
import { art16ReactionAnchors } from "../lib/art16-reactions";
import type { Art16SceneId } from "../lib/art16-scene-styles";
import type { PixelBreed } from "../lib/dog-breeds";
import { CuteDogAccessories } from "./cute-pixel-dog";

type Props = { id: string; breed: PixelBreed; scene: Art16SceneId; width: number; height: number; frame: number; behind?: boolean };
const reference = { faceX: 32, eyeY: 26, eyeGap: 7, headTop: 8, headBottom: 39, footY: 57 };

/** Reuse the same item artwork while attaching it to each breed's actual head, ears and neck. */
export function Art16DogAccessories({ id, breed, scene, width, height, frame, behind = false }: Props) {
  if (id === "none" || (id === "angel-wings") !== behind) return null;
  const a = art16AccessoryPlacement(breed, scene, width, height, frame);
  if (!a) return null;
  const scale = `scale(${width / 64} ${height / 64})`;
  if (id === "angel-wings") return <g transform={scale} shapeRendering="crispEdges">
    <g data-cosmetic={id} transform={`translate(${a.neckCenterX - 32} ${a.neckY - 39})`}>
      <path d="M18 39 7 29H3v10l5 8 14 5zM46 39l11-10h4v10l-5 8-14 5z" fill="#a8b3c7" />
      <path d="M17 40 5 32v7l5 7 11 4zM47 40l12-8v7l-5 7-11 4z" fill="#f4f5fc" />
    </g>
  </g>;
  if (id === "glasses") {
    const native = scene === "idle" ? art16ReactionAnchors(breed, width, height) : undefined;
    const eyes = native?.eyes.map(eye => ({ x: eye.x / width * 64, y: eye.y / height * 64,
      rx: eye.rx / width * 64, ry: eye.ry / height * 64 })) ?? a.eyes;
    if (eyes?.length) return <g transform={scale} shapeRendering="crispEdges" data-cosmetic={id} fill="none" stroke="#39343a" strokeWidth="1">
      {eyes.map((eye, n) => <rect key={n} x={eye.x - eye.rx - .8} y={eye.y - eye.ry - .7}
        width={eye.rx * 2 + 1.6} height={eye.ry * 2 + 1.4} rx=".7" />)}
      {eyes.length === 2 && <path d={`M${eyes[0].x + eyes[0].rx + .8} ${eyes[0].y}L${eyes[1].x - eyes[1].rx - .8} ${eyes[1].y}`} />}
    </g>;
  }
  let x = a.headCenterX - reference.faceX, y = a.foreheadY - reference.headTop;
  if (id === "ribbon" || id === "bow-blue" || id === "bow-lilac") { x = a.ribbonX - 48; y = a.ribbonY - 14.5; }
  else if (id === "flower") { x = a.ribbonX - 47; y = a.ribbonY - 13; }
  else if (id === "crown") { x = a.headCenterX - 32.5; y = a.foreheadY - 10; }
  else if (id === "party-hat") { x = a.headCenterX - 32; y = a.foreheadY - 11; }
  else if (id === "halo") { x = a.headCenterX - 32; y = a.foreheadY - 13.5; }
  else if (id === "scarf") { x = a.neckCenterX - 32; y = a.neckY - 38.5; }
  else if (id === "glasses") { y = a.eyeY - reference.eyeY; }
  return <g transform={scale} shapeRendering="crispEdges"><g transform={`translate(${x} ${y})`}>
    <CuteDogAccessories id={id} a={reference} detailed />
  </g></g>;
}
