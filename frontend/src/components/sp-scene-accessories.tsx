import { art16FrameIndex } from "../lib/art16-scene-styles";
import type { SpSceneAsset, SpSceneId } from "../lib/sp-scene-styles";
import { CuteDogAccessories } from "./cute-pixel-dog";
import placements from "../lib/generated/sp-scene-accessory-anchors.json";

const reference = { faceX: 32, eyeY: 26, eyeGap: 7, headTop: 8, headBottom: 39, footY: 57 };
type Attachment = { headX: number; eyeY: number; top: number; neckX: number; neckY: number; neckAngle?: number; neckScale?: number; ribbonX: number; ribbonY: number;
  eyes?: { x: number; y: number; rx: number; ry: number }[] };
type AttachmentSet = { width: number; height: number; scenes: Partial<Record<SpSceneId, Attachment[]>> };
export function spSceneAnchors(asset: SpSceneAsset, scene: SpSceneId, frame = 0) {
  const reviewed = (placements as Record<string, AttachmentSet>)[`${asset.style}/${asset.breed}`];
  const placement = reviewed?.scenes[scene]?.[art16FrameIndex(frame, asset.scenes[scene].frames)];
  if (reviewed?.width === asset.width && reviewed.height === asset.height && placement) return placement;
  const bounds = asset.frameBounds?.[scene]?.[art16FrameIndex(frame, asset.scenes[scene].frames)]
    ?? { x: asset.width * .15, y: asset.height * .12, width: asset.width * .7, height: asset.height * .78 };
  const x = bounds.x / asset.width * 64, y = bounds.y / asset.height * 64;
  const width = bounds.width / asset.width * 64, height = bounds.height / asset.height * 64;
  const side = scene === "side" || scene === "walk" || scene === "sleep";
  const eyes = scene === "idle" ? asset.reactions?.eyes.map(eye => ({ x: eye.x / asset.width * 64, y: eye.y / asset.height * 64, rx: eye.rx / asset.width * 64, ry: eye.ry / asset.height * 64 })) : undefined;
  const headX = eyes ? (eyes[0].x + eyes[1].x) / 2 : x + width * (side ? .3 : .45);
  const eyeY = eyes ? (eyes[0].y + eyes[1].y) / 2 : y + height * (scene === "sleep" ? .45 : .36);
  const top = y + height * .08;
  return { headX, eyeY, top, neckX: scene === "sleep" ? x + width * .57 : headX,
    neckY: eyes ? eyeY + (eyeY - top) * .75 : y + height * (scene === "sleep" ? .68 : .7), neckAngle: scene === "sleep" ? 75 : 0,
    ribbonX: headX + width * (side ? .16 : .28), ribbonY: y + height * .2, eyes };
}

/** Attach to each frame's native artwork bounds; original dog pixels remain unchanged. */
export function SpSceneAccessories({ id, asset, scene, frame, behind = false }: {
  id: string; asset: SpSceneAsset; scene: SpSceneId; frame: number; behind?: boolean;
}) {
  if (id === "none" || (id === "angel-wings") !== behind) return null;
  const a = spSceneAnchors(asset, scene, frame);
  const scale = `scale(${asset.width / 64} ${asset.height / 64})`;
  if (id === "angel-wings") return <g transform={scale} shapeRendering="crispEdges">
    <g data-cosmetic={id} transform={`translate(${a.neckX - 32} ${a.neckY - 39})`}>
      <path d="M18 39 7 29H3v10l5 8 14 5zM46 39l11-10h4v10l-5 8-14 5z" fill="#a8b3c7" />
      <path d="M17 40 5 32v7l5 7 11 4zM47 40l12-8v7l-5 7-11 4z" fill="#f4f5fc" />
    </g>
  </g>;
  if (id === "glasses" && a.eyes) return <g transform={scale} data-cosmetic={id} fill="none" stroke="#39343a" strokeWidth="1">
    {a.eyes.map((eye, n) => <rect key={n} x={eye.x - eye.rx - .8} y={eye.y - eye.ry - .7} width={eye.rx * 2 + 1.6} height={eye.ry * 2 + 1.4} rx=".7" />)}
    {a.eyes.length === 2 && <path d={`M${a.eyes[0].x + a.eyes[0].rx + .8} ${a.eyes[0].y}L${a.eyes[1].x - a.eyes[1].rx - .8} ${a.eyes[1].y}`} />}
  </g>;
  let x = a.headX - 32, y = a.top - 8;
  if (["ribbon", "bow-blue", "bow-lilac"].includes(id)) { x = a.ribbonX - 48; y = a.ribbonY - 14.5; }
  else if (id === "flower") { x = a.ribbonX - 47; y = a.ribbonY - 13; }
  else if (id === "crown") { x = a.headX - 32.5; y = a.top - 10; }
  else if (id === "party-hat") { y = a.top - 11; }
  else if (id === "halo") { y = a.top - 13.5; }
  else if (id === "scarf") { x = a.neckX - 32; y = a.neckY - 38.5; }
  else if (id === "glasses") { y = a.eyeY - reference.eyeY; }
  return <g transform={scale} shapeRendering="crispEdges"><g transform={id === "scarf" && a.neckAngle ? `rotate(${a.neckAngle} ${a.neckX} ${a.neckY}) translate(${a.neckX} ${a.neckY}) scale(${a.neckScale ?? 1}) translate(${-a.neckX} ${-a.neckY})` : undefined}>
    <g transform={`translate(${x} ${y})`}><CuteDogAccessories id={id} a={reference} detailed /></g>
  </g></g>;
}
