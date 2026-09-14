import { useId, type CSSProperties } from "react";
import { assetUrl } from "../lib/asset-url";
import { art16FrameIndex } from "../lib/art16-scene-styles";
import { dogBreedById, type PixelBreed } from "../lib/dog-breeds";
import { rubyEyeStyle } from "../lib/ruby-round-eyes";
import { rubyRoundEyePair, rubyRoundGazeOffset } from "../lib/ruby-round-eye-motion";
import { rubyRoundAsset, rubyRoundScenes, rubyRoundSceneForMood, rubyRoundStyleId, type RubyEyeAnchor, type RubyRoundAsset, type RubyRoundSceneId } from "../lib/ruby-round-scene-styles";
import { CuteDogAccessories } from "./cute-pixel-dog";
import type { PixelMood } from "./pixel-dog";
import motion from "./art16-scene-pixel-dog.module.css";
import styles from "./ruby-round-pixel-dog.module.css";

export function RubyRoundPixelDog({ breed, mood, scene, eyeStyle, paused = false, frame = 0, look = 0, lookY = 0, accessory = "none", className = "", decorative = false, groundShadow = true }: {
  breed: PixelBreed; mood: PixelMood; scene?: RubyRoundSceneId; eyeStyle?: string; paused?: boolean; frame?: number; look?: number; lookY?: number;
  accessory?: string; className?: string; decorative?: boolean; groundShadow?: boolean;
}) {
  const id = `ruby-round-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const asset = rubyRoundAsset(breed);
  if (!asset) return null;
  const preview = rubyRoundScenes.some(item => item.id === scene);
  const activeScene = preview ? scene! : paused ? "idle" : rubyRoundSceneForMood(mood);
  const sheet = asset.scenes[activeScene], index = paused ? art16FrameIndex(frame, sheet.frames) : 0;
  const reacting = !preview && !paused;
  const typing = reacting && activeScene === "idle" && (mood === "typing" || mood === "excited");
  const gazing = reacting && activeScene === "idle" && !typing && mood !== "belly";
  const eye = rubyEyeStyle(activeScene === "sleep" ? "ruby-eye-10" : eyeStyle);
  const png = assetUrl(sheet.png);
  const eyeFrames = sheet.eyes.map(anchors => activeScene === "idle" || activeScene === "happy"
    ? rubyRoundEyePair(anchors, asset.scenes.idle.eyes[0]) : anchors);
  const animated = !paused && !typing;
  const label = `${dogBreedById(breed).name} · ${rubyRoundScenes.find(item => item.id === activeScene)?.name} · ${eye.label}`;
  const animationStyle = { "--art16-duration": `${sheet.frames * sheet.frameMs}ms`, "--art16-frames": sheet.frames,
    "--art16-end": `${-asset.width * sheet.frames}px`, "--art16-paw-speed": mood === "excited" ? "180ms" : "300ms" } as CSSProperties;
  const paws = asset.reactions?.paws ?? [0.39, 0.61].map(x => ({ x: asset.width * x, y: asset.height * .875, rx: asset.width * .06, ry: asset.height * .055 }));
  const keyboardY = paws ? (paws[0].y + paws[1].y) / 2 - asset.height * .025 : asset.height * .77;
  return <svg viewBox={`0 0 ${asset.width} ${asset.height}`} className={`pixel-dog ${motion.dog} ${styles.dog} ${className}`} style={animationStyle}
    data-dog-style={rubyRoundStyleId} data-dog-breed={breed} data-dog-scene={activeScene} data-frame-count={sheet.frames} data-eye-style={eye.id}
    data-dog-reaction={reacting ? mood : undefined} data-dog-gaze={gazing ? `${look},${lookY}` : undefined}
    data-paused={paused || undefined} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}>
    <defs>{paws?.map((paw, n) => <clipPath key={n} id={`${id}-paw-${n}`}><ellipse cx={paw.x} cy={paw.y} rx={paw.rx} ry={paw.ry} /></clipPath>)}</defs>
    {groundShadow && <ellipse cx={asset.width / 2} cy={asset.height * .94} rx={asset.width * .28} ry={asset.height * .017} fill="#574e45" opacity=".12" />}
    <g className={motion.body}>
      <svg width={asset.width} height={asset.height} viewBox={`0 0 ${asset.width} ${asset.height}`} className={motion.viewport}>
        <g key={`${breed}-${activeScene}`} className={animated ? motion.playing : undefined}>
          {accessory === "angel-wings" && eyeFrames.map((anchors, n) => <g key={n} transform={`translate(${(n - index) * asset.width} 0)`}><RubyAccessories id={accessory} asset={asset} anchors={anchors} scene={activeScene} /></g>)}
          <image href={png} x={-index * asset.width} width={asset.width * sheet.frames} height={asset.height} preserveAspectRatio="none" className={motion.strip} data-eyeless-body="true" />
          {eyeFrames.map((anchors, n) => {
            const offset = rubyRoundGazeOffset(anchors, gazing ? look : 0, gazing ? lookY : 0);
            return <g key={n} transform={`translate(${(n - index) * asset.width} 0)`} data-eye-frame={n}>
            <g transform={`translate(${offset.x} ${offset.y})`} data-eye-pair="true" data-eye-offset={`${offset.x},${offset.y}`}>
              <g className={activeScene === "sleep" || paused ? undefined : styles.blink} data-shared-blink="true">
                {anchors.map((anchor, side) => <svg key={side} x={anchor.x} y={anchor.y} width={anchor.width} height={anchor.height} viewBox={`${side * 16} 0 16 16`} overflow="hidden" data-common-eye={side}>
                  <image href={assetUrl(eye.png)} width="32" height="16" className={motion.strip} />
                </svg>)}
              </g>
            </g>
            {accessory !== "none" && accessory !== "angel-wings" && <RubyAccessories id={accessory} asset={asset} anchors={anchors} scene={activeScene} />}
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
      {mood === "love" && <g fill="#d98691" className={motion.hearts}><path d="M3 10h3v2h2v-2h3v5H9v2H7v2H5v-2H3zM53 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
      {mood === "eat" && <g><path d="M24 55h20v4H24zM27 59h14v2H27z" fill="#cd8277" /><path d="M26 53h16v3H26z" fill="#70513e" /><path className={motion.crumbs} d="M28 50h3v2h-3zM37 51h3v2h-3z" fill="#c39765" /></g>}
      {activeScene === "sleep" && <g fill="#b6b2cb" className={motion.sleepSigns}><path d="M45 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM54 3h7v2h-2v2h-2v2h4v2h-7V9h2V7h2V5h-4z" /></g>}
    </g>}
  </svg>;
}

/** Cosmetics follow the per-frame eye positions rather than a fixed screen position. */
function RubyAccessories({ id, asset, anchors, scene }: { id: string; asset: RubyRoundAsset; anchors: RubyEyeAnchor[]; scene: RubyRoundSceneId }) {
  const centerX = anchors.length ? anchors.reduce((sum, a) => sum + a.x + a.width / 2, 0) / anchors.length / asset.width * 64 : 32;
  const centerY = anchors.length ? anchors.reduce((sum, a) => sum + a.y + a.height / 2, 0) / anchors.length / asset.height * 64 : 34;
  const x = centerX - 32;
  const y = id === "scarf" ? centerY - 28 : centerY - 26;
  return <g transform={`scale(${asset.width / 64} ${asset.height / 64})`} shapeRendering="crispEdges" data-cosmetic-scene={scene}>
    <g transform={`translate(${x} ${y})`}><CuteDogAccessories id={id} a={{ faceX: 32, eyeY: 26, eyeGap: 7, headTop: 8, headBottom: 39, footY: 57 }} detailed /></g>
  </g>;
}
