import { useId, type CSSProperties } from "react";
import { assetUrl } from "../lib/asset-url";
import { art16FrameIndex } from "../lib/art16-scene-styles";
import { art16GazeOffset } from "../lib/art16-reactions";
import { spSceneAsset, spSceneForMood, spScenes, isSpSceneId, type SpSceneId, type SpSceneStyleId } from "../lib/sp-scene-styles";
import { dogBreedById, type PixelBreed } from "../lib/dog-breeds";
import { SpSceneAccessories } from "./sp-scene-accessories";
import type { PixelMood } from "./pixel-dog";
import styles from "./art16-scene-pixel-dog.module.css";

type Props = { breed: PixelBreed; mood: PixelMood; styleId: SpSceneStyleId; scene?: SpSceneId; paused?: boolean; frame?: number; look?: number; lookY?: number;
  accessory?: string; className?: string; decorative?: boolean; groundShadow?: boolean };

/** Each moving eye and typing paw is a clipped piece of the original native-resolution artwork. */
export function SpScenePixelDog({ styleId, breed, mood, scene, paused = false, frame = 0, look = 0, lookY = 0, accessory = "none", className = "", decorative = false, groundShadow = true }: Props) {
  const id = `sp-scene-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const asset = spSceneAsset(styleId, breed);
  if (!asset) return null;
  const scenePreview = isSpSceneId(scene);
  const reacting = !scenePreview && !paused;
  const activeScene = scenePreview ? scene : paused ? "idle" : spSceneForMood(mood);
  const sheet = asset.scenes[activeScene], animated = sheet.frames > 1 && !paused;
  const index = paused ? art16FrameIndex(frame, sheet.frames) : 0;
  const label = `${dogBreedById(breed).name} · ${spScenes.find(item => item.id === activeScene)?.name}`;
  const native = asset.reactions;
  const front = activeScene === "idle";
  const typing = reacting && front && (mood === "typing" || mood === "excited");
  const gaze = reacting && front && native && !typing && mood !== "belly" && (look !== 0 || lookY !== 0);
  const cosmeticScale = `scale(${asset.width / 64} ${asset.height / 64})`;
  const animationStyle = { "--art16-duration": `${sheet.frames * sheet.frameMs}ms`, "--art16-frames": sheet.frames,
    "--art16-end": `${-asset.width * sheet.frames}px`, "--art16-paw-speed": mood === "excited" ? "180ms" : "300ms" } as CSSProperties;
  const png = assetUrl(sheet.png);
  const idlePng = assetUrl(asset.scenes.idle.png);
  const pawY = native ? (native.paws[0].y + native.paws[1].y) / 2 : asset.height * .8;
  const keyboardHeight = Math.round(asset.height * .125);
  const keyboardTop = Math.round(Math.min(asset.height - keyboardHeight - 3, pawY - asset.height * .035));
  const keyboardWidth = native ? Math.round(Math.max(asset.width * .5, native.paws[1].x - native.paws[0].x + Math.max(...native.paws.map(p => p.rx)) * 3.4)) : asset.width * .55;
  const keyboardX = native ? Math.round((native.paws[0].x + native.paws[1].x - keyboardWidth) / 2) : asset.width * .22;
  const keyUnit = keyboardWidth / 38;
  return <svg viewBox={`0 0 ${asset.width} ${asset.height}`} className={`pixel-dog dog-style-sp-scenes ${styles.dog} ${className}`} style={animationStyle}
    data-dog-style={styleId} data-dog-breed={breed} data-dog-scene={activeScene} data-frame-count={sheet.frames}
    data-dog-reaction={reacting ? mood : undefined} data-dog-gaze={gaze ? `${look},${lookY}` : undefined}
    data-original-colors="true" data-paused={paused || undefined} role={decorative ? undefined : "img"}
    aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}>
    <defs>
      <clipPath id={`${id}-frame`}><rect width={asset.width} height={asset.height} /></clipPath>
      {native?.eyes.map((eye, n) => <clipPath key={`eye-${n}`} id={`${id}-eye-${n}`}><ellipse cx={eye.x} cy={eye.y} rx={eye.rx} ry={eye.ry} /></clipPath>)}
      {native?.paws.map((paw, n) => <clipPath key={`paw-${n}`} id={`${id}-paw-${n}`}><ellipse cx={paw.x} cy={paw.y} rx={paw.rx} ry={paw.ry} /></clipPath>)}
    </defs>
    {groundShadow && <ellipse transform={cosmeticScale} cx="32" cy="59" rx="18" ry="1" fill="#574e45" opacity=".12" />}
    <g className={styles.body}>
      <svg x="0" y="0" width={asset.width} height={asset.height} viewBox={`0 0 ${asset.width} ${asset.height}`} preserveAspectRatio="xMidYMid meet" className={styles.viewport}>
        <g key={`${styleId}-${breed}-${activeScene}`} className={`${styles.strip}${animated ? ` ${styles.playing}` : ""}`}>
          {accessory === "angel-wings" && Array.from({ length: sheet.frames }, (_, n) => <g key={`back-${n}`} transform={`translate(${(n - index) * asset.width} 0)`}>
            <g clipPath={`url(#${id}-frame)`}><SpSceneAccessories id={accessory} asset={asset} scene={activeScene} frame={n} behind /></g>
          </g>)}
          <image data-original-art="true" href={png} x={-index * asset.width} y="0"
            width={asset.width * sheet.frames} height={asset.height} preserveAspectRatio="none"
            className={styles.strip} style={{ imageRendering: "pixelated" }} />
          {gaze && native.eyes.map((eye, n) => {
            const offset = art16GazeOffset(eye, look, lookY, paused);
            return <g key={n} clipPath={`url(#${id}-eye-${n})`} className={styles.gaze} data-gaze-offset={`${offset.x},${offset.y}`}>
              <image href={idlePng} x={offset.x} y={offset.y} width={asset.width} height={asset.height} preserveAspectRatio="none" className={styles.strip} />
            </g>;
          })}
          {accessory !== "none" && accessory !== "angel-wings" && Array.from({ length: sheet.frames }, (_, n) => <g key={`front-${n}`} transform={`translate(${(n - index) * asset.width} 0)`}>
            <g clipPath={`url(#${id}-frame)`}><SpSceneAccessories id={accessory} asset={asset} scene={activeScene} frame={n} /></g>
          </g>)}
        </g>
      </svg>
    </g>
    {typing && native && <g data-dog-keyboard="front" shapeRendering="crispEdges">
      <g transform={`translate(${keyboardX} ${keyboardTop}) scale(${keyUnit} ${keyboardHeight / 10})`}>
        <path d="M1 0h36v1h1v7h-2v2H2V8H0V1h1z" fill="#77726d" />
        <path d="M2 1h34v6H2zM3 7h32v1H3z" fill="#eee9dd" />
        <g fill="#b2aa9b">{Array.from({ length: 7 }, (_, n) => <path key={n} d={`M${3 + n * 4.7} 2h3v1.5h-3zM${3 + n * 4.7} 4.2h3v1.5h-3z`} />)}<path d="M10 6h18v1H10z" /></g>
        <path className={styles.keyLeft} d="M7.7 2h3v1.5h-3zM12.4 4.2h3v1.5h-3z" fill="#77726d" />
        <path className={styles.keyRight} d="M26.5 2h3v1.5h-3zM21.8 4.2h3v1.5h-3z" fill="#77726d" />
      </g>
      {native.paws.map((paw, n) => <g key={n} transform={`translate(0 ${Math.round(keyboardTop - paw.y - paw.ry * .15)})`}>
        <g className={n === 0 ? styles.pawLeft : styles.pawRight} data-typing-paw={n === 0 ? "left" : "right"}>
          <g clipPath={`url(#${id}-paw-${n})`}><image href={idlePng} x="0" y="0" width={asset.width} height={asset.height} preserveAspectRatio="none" className={styles.strip} /></g>
        </g>
      </g>)}
    </g>}
    {reacting && <g transform={cosmeticScale} shapeRendering="crispEdges">
      {mood === "love" && <g fill="#d98691" className={styles.hearts}><path d="M3 10h3v2h2v-2h3v5H9v2H7v2H5v-2H3zM53 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z" /></g>}
      {mood === "eat" && <g><path d="M24 55h20v4H24zM27 59h14v2H27z" fill="#cd8277" /><path d="M26 53h16v3H26z" fill="#70513e" /><path className={styles.crumbs} d="M28 50h3v2h-3zM37 51h3v2h-3z" fill="#c39765" /></g>}
      {mood === "excited" && <g fill="#a9c7da" className={styles.sweat}><path d="M10 16h2v4h-2zM50 9h2v5h-2zM57 17h2v4h-2z" /></g>}
      {mood === "scroll" && <g className={styles.scroll}><path d="M5 43h9v14H5zM7 41h5v2H7zM7 57h10v2H7z" fill="#e8e1d6" /><path d="M8 44h3v5H8z" fill="#807a72" /><path d="M15 42h2v3h2v2h-2v3h-2zM17 51h2v3h2v2h-2v3h-2z" fill="#b6c2ca" /></g>}
      {activeScene === "sleep" && <g fill="#b6b2cb" className={styles.sleepSigns}><path d="M45 12h7v2h-2v2h-2v2h4v2h-7v-2h2v-2h2v-2h-4zM54 3h7v2h-2v2h-2v2h4v2h-7V9h2V7h2V5h-4z" /></g>}
    </g>}
  </svg>;
}

