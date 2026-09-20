import { useId, type CSSProperties } from "react";
import { assetUrl } from "../lib/asset-url";
import { art16FrameIndex } from "../lib/art16-scene-styles";
import { dogBreedById, type PixelBreed } from "../lib/dog-breeds";
import { rubyEyeStyle } from "../lib/ruby-round-eyes";
import { rubyRoundEyePair, rubyRoundGazeOffset } from "../lib/ruby-round-eye-motion";
import { resolvedRubyAccessoryActionPlacement, rubyAccessoryItem, type RubyAccessoryItem } from "../lib/ruby-round-accessories";
import {
  isRubyRoundActionId, rubyRoundActionForMood, rubyRoundActionList, rubyRoundActionSheets,
  rubyRoundAsset, rubyRoundFrameEyeMode, rubyRoundStyleId, type RubyEyeAnchor, type RubyRoundActionId, type RubyRoundAsset,
} from "../lib/ruby-round-scene-styles";
import { CuteDogAccessories } from "./cute-pixel-dog";
import type { PixelMood } from "./pixel-dog";
import motion from "./art16-scene-pixel-dog.module.css";
import styles from "./ruby-round-pixel-dog.module.css";

export function RubyRoundPixelDog({ breed, mood, scene, eyeStyle, paused = false, frame = 0, look = 0, lookY = 0, accessory = "none", className = "", decorative = false, groundShadow = true }: {
  breed: PixelBreed; mood: PixelMood; scene?: RubyRoundActionId; eyeStyle?: string; paused?: boolean; frame?: number; look?: number; lookY?: number;
  accessory?: string; className?: string; decorative?: boolean; groundShadow?: boolean;
}) {
  const id = `ruby-round-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const asset = rubyRoundAsset(breed);
  if (!asset) return null;
  const sheets = rubyRoundActionSheets(asset);
  const preview = isRubyRoundActionId(scene) && Object.hasOwn(sheets, scene);
  const requestedAction = paused ? "idle" : rubyRoundActionForMood(mood);
  const activeScene = preview ? scene : Object.hasOwn(sheets, requestedAction) ? requestedAction : "idle";
  const sheet = sheets[activeScene as keyof typeof sheets]!, index = paused ? art16FrameIndex(frame, sheet.frames) : 0;
  const reacting = !preview && !paused;
  const nativeReaction = !!asset.actions && (sheet.kind === "derived" || sheet.kind === "redrawn");
  const typing = reacting && activeScene === "idle" && (mood === "typing" || mood === "excited");
  const gazing = reacting && (sheet.eyeModeByFrame?.includes("shared") ?? sheet.eyeMode === "shared") && !typing && mood !== "belly";
  const eye = rubyEyeStyle(!sheet.eyeModeByFrame && sheet.eyeMode === "closed" ? "ruby-eye-10" : eyeStyle);
  const accessoryItem = rubyAccessoryItem(accessory);
  const accessoryLayer = accessoryItem?.layer ?? (accessory === "angel-wings" ? "behind" : "front");
  const png = assetUrl(sheet.png);
  // Redrawn frames already carry pose-specific geometry, including a tilted head.
  // Only the shared gaze translation is added; never replace those eyes with idle geometry.
  const eyeFrames = sheet.eyes.map(anchors => sheet.kind !== "redrawn" && (sheet.eyeMode === "shared" || sheet.eyeMode === "closed")
    ? rubyRoundEyePair(anchors, asset.scenes.idle.eyes[0]) : anchors);
  const animated = !paused && !typing;
  const label = `${dogBreedById(breed).name} · ${rubyRoundActionList(asset).find(item => item.id === activeScene)?.name} · ${eyeFrames.every(anchors => !anchors.length) ? "동작 전용 눈" : eye.label}`;
  const animationStyle = { "--art16-duration": `${sheet.frames * sheet.frameMs}ms`, "--art16-frames": sheet.frames,
    "--art16-end": `${-asset.width * sheet.frames}px`, "--art16-paw-speed": mood === "excited" ? "180ms" : "300ms" } as CSSProperties;
  const paws = asset.reactions?.paws ?? [0.39, 0.61].map(x => ({ x: asset.width * x, y: asset.height * .875, rx: asset.width * .06, ry: asset.height * .055 }));
  const keyboardY = paws ? (paws[0].y + paws[1].y) / 2 - asset.height * .025 : asset.height * .77;
  return <svg viewBox={`0 0 ${asset.width} ${asset.height}`} className={`pixel-dog ${motion.dog} ${styles.dog} ${className}`} style={animationStyle}
    data-dog-style={rubyRoundStyleId} data-dog-breed={breed} data-dog-scene={activeScene} data-frame-count={sheet.frames} data-eye-style={eye.id} data-eye-mode={sheet.eyeMode}
    data-dog-reaction={reacting && !nativeReaction ? mood : undefined} data-dog-gaze={gazing ? `${look},${lookY}` : undefined}
    data-paused={paused || undefined} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}>
    <defs>
      <clipPath id={`${id}-frame`}><rect width={asset.width} height={asset.height} /></clipPath>
      {paws?.map((paw, n) => <clipPath key={n} id={`${id}-paw-${n}`}><ellipse cx={paw.x} cy={paw.y} rx={paw.rx} ry={paw.ry} /></clipPath>)}
    </defs>
    {groundShadow && <ellipse cx={asset.width / 2} cy={asset.height * .94} rx={asset.width * .28} ry={asset.height * .017} fill="#574e45" opacity=".12" />}
    <g className={motion.body}>
      <svg width={asset.width} height={asset.height} viewBox={`0 0 ${asset.width} ${asset.height}`} className={motion.viewport}>
        <g key={`${breed}-${activeScene}`} className={animated ? motion.playing : undefined}>
          {accessory !== "none" && accessoryLayer === "behind" && eyeFrames.map((anchors, n) => <g key={n} transform={`translate(${(n - index) * asset.width} 0)`} clipPath={`url(#${id}-frame)`}><RubyAccessories id={accessory} item={accessoryItem} asset={asset} anchors={anchors} scene={activeScene} frame={n} /></g>)}
          <image href={png} x={-index * asset.width} width={asset.width * sheet.frames} height={asset.height} preserveAspectRatio="none" className={motion.strip} data-eyeless-body="true" />
          {eyeFrames.map((anchors, n) => {
            const frameEyeMode = rubyRoundFrameEyeMode(sheet, n), shared = frameEyeMode === "shared";
            const offset = rubyRoundGazeOffset(anchors, shared && gazing ? look : 0, shared && gazing ? lookY : 0);
            return <g key={n} transform={`translate(${(n - index) * asset.width} 0)`} clipPath={`url(#${id}-frame)`} data-eye-frame={n} data-eye-frame-mode={frameEyeMode}>
            {shared && <g transform={`translate(${offset.x} ${offset.y})`} data-eye-pair="true" data-eye-offset={`${offset.x},${offset.y}`}>
              <g className={activeScene === "sleep" || paused || sheet.eyeModeByFrame?.includes("baked-closed") ? undefined : styles.blink} data-shared-blink="true">
                {anchors.map((anchor, side) => <svg key={side} x={anchor.x} y={anchor.y} width={anchor.width} height={anchor.height} viewBox={`${side * 16} 0 16 16`} overflow="hidden" data-common-eye={side}>
                  <image href={assetUrl(eye.png)} width="32" height="16" className={motion.strip} />
                </svg>)}
              </g>
            </g>}
            {accessory !== "none" && accessoryLayer === "front" && <RubyAccessories id={accessory} item={accessoryItem} asset={asset} anchors={anchors} scene={activeScene} frame={n} />}
          </g>; })}
        </g>
      </svg>
    </g>
    {typing && <g data-dog-keyboard="front">
      <g transform={`translate(${asset.width * .23} ${keyboardY}) scale(${asset.width * .54 / 38} ${asset.height * .12 / 10})`} shapeRendering="crispEdges">
        <path d="M1 0h36v1h1v7h-2v2H2V8H0V1h1z" fill="#77726d" /><path d="M2 1h34v6H2zM3 7h32v1H3z" fill="#eee9dd" />
        <g fill="#b2aa9b">{Array.from({ length: 7 }, (_, n) => <path key={n} d={`M${3 + n * 4.7} 2h3v1.5h-3zM${3 + n * 4.7} 4.2h3v1.5h-3z`} />)}<path d="M10 6h18v1H10z" /></g>
        <path className={motion.keyLeft} d="M7.7 2h3v1.5h-3zM12.4 4.2h3v1.5h-3z" fill="#77726d" /><path className={motion.keyRight} d="M26.5 2h3v1.5h-3zM21.8 4.2h3v1.5h-3z" fill="#77726d" />
      </g>
      {paws?.map((paw, n) => <g key={n} transform={`translate(0 ${Math.round(keyboardY - paw.y)})`}><g className={n === 0 ? motion.pawLeft : motion.pawRight} data-typing-paw={n}>
        <g clipPath={`url(#${id}-paw-${n})`}><image href={assetUrl(asset.scenes.idle.png)} width={asset.width * asset.scenes.idle.frames} height={asset.height} className={motion.strip} /></g>
      </g></g>)}
    </g>}
    {reacting && <g transform={`scale(${asset.width / 64} ${asset.height / 64})`} shapeRendering="crispEdges">
      {mood === "love" && !nativeReaction && <g fill="#d98691" className={motion.hearts}><path d="M3 10h3v2h2v-2h3v5H9v2H7v2H5v-2H3zM53 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
      {mood === "eat" && activeScene !== "eat" && <g><path d="M24 55h20v4H24zM27 59h14v2H27z" fill="#cd8277" /><path d="M26 53h16v3H26z" fill="#70513e" /><path className={motion.crumbs} d="M28 50h3v2h-3zM37 51h3v2h-3z" fill="#c39765" /></g>}
      {activeScene === "sleep" && sheet.kind !== "redrawn" && <g fill="#b6b2cb" className={motion.sleepSigns}><path d="M45 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM54 3h7v2h-2v2h-2v2h4v2h-7V9h2V7h2V5h-4z" /></g>}
    </g>}
  </svg>;
}

/** Catalog cosmetics use reviewed per-frame slots; unknown legacy IDs retain the old eye-relative fallback. */
function RubyAccessories({ id, item, asset, anchors, scene, frame }: { id: string; item?: RubyAccessoryItem; asset: RubyRoundAsset; anchors: RubyEyeAnchor[]; scene: RubyRoundActionId; frame: number }) {
  const placement = item ? resolvedRubyAccessoryActionPlacement(item, asset.breed, scene, frame) : undefined;
  if (item?.renderer === "image" && item.asset) {
    if (!placement?.visible) return null;
    const scaleX = placement.width / item.asset.width * (placement.flipX ? -1 : 1);
    const scaleY = placement.height / item.asset.height;
    return <g transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotation}) scale(${scaleX} ${scaleY})`}
      data-cosmetic={item.id} data-cosmetic-slot={item.slot} data-cosmetic-layer={item.layer} data-cosmetic-revision={item.revision}>
      <image href={assetUrl(item.asset.png)} x={-item.asset.pivotX} y={-item.asset.pivotY} width={item.asset.width} height={item.asset.height}
        preserveAspectRatio="none" className={motion.strip} />
    </g>;
  }
  if (item?.renderer === "builtin" && placement) {
    if (!placement.visible) return null;
    const canonical = {
      face: { x: 32, y: 26, width: 22, height: 10 }, head: { x: 32, y: 8, width: 18, height: 14 },
      neck: { x: 32, y: 41, width: 24, height: 12 }, back: { x: 32, y: 40, width: 58, height: 23 },
    }[item.slot];
    const scaleX = placement.width / canonical.width * (placement.flipX ? -1 : 1), scaleY = placement.height / canonical.height;
    return <g transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotation}) scale(${scaleX} ${scaleY}) translate(${-canonical.x} ${-canonical.y})`}
      shapeRendering="crispEdges" data-cosmetic-slot={item.slot} data-cosmetic-layer={item.layer} data-cosmetic-revision={item.revision}>
      <BuiltinRubyAccessory id={id} />
    </g>;
  }
  if (!anchors.length) return null;
  const centerX = anchors.length ? anchors.reduce((sum, a) => sum + a.x + a.width / 2, 0) / anchors.length / asset.width * 64 : 32;
  const centerY = anchors.length ? anchors.reduce((sum, a) => sum + a.y + a.height / 2, 0) / anchors.length / asset.height * 64 : 34;
  const x = centerX - 32;
  const y = id === "scarf" ? centerY - 28 : centerY - 26;
  return <g transform={`scale(${asset.width / 64} ${asset.height / 64})`} shapeRendering="crispEdges" data-cosmetic-scene={scene}
    data-cosmetic-slot={item?.slot} data-cosmetic-layer={item?.layer ?? (id === "angel-wings" ? "behind" : "front")} data-cosmetic-revision={item?.revision}>
    <g transform={`translate(${x} ${y})`}><CuteDogAccessories id={id} a={{ faceX: 32, eyeY: 26, eyeGap: 7, headTop: 8, headBottom: 39, footY: 57 }} detailed /></g>
  </g>;
}

const referenceAccessoryAnchors = { faceX: 32, eyeY: 26, eyeGap: 7, headTop: 8, headBottom: 39, footY: 57 };
function BuiltinRubyAccessory({ id }: { id: string }) {
  if (id === "angel-wings") return <g data-cosmetic={id}>
    <path d="M18 39 7 29H3v10l5 8 14 5zM46 39l11-10h4v10l-5 8-14 5z" fill="#a8b3c7" />
    <path d="M17 40 5 32v7l5 7 11 4zM47 40l12-8v7l-5 7-11 4z" fill="#f4f5fc" />
  </g>;
  return <CuteDogAccessories id={id} a={referenceAccessoryAnchors} detailed />;
}
