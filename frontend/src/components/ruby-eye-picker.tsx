import { assetUrl } from "../lib/asset-url";
import { rubyEyeStyles, rubyEyeStyle } from "../lib/ruby-round-eyes";
import styles from "./ruby-round-pixel-dog.module.css";

export function RubyEyePicker({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const selected = rubyEyeStyle(value).id;
  return <div className={styles.picker} role="group" aria-label="공통 눈 스타일 30가지">
    {rubyEyeStyles.map(eye => <button key={eye.id} type="button" className={styles.choice} aria-pressed={selected === eye.id} onClick={() => onChange(eye.id)} disabled={disabled}>
      <svg viewBox="0 0 32 16" aria-hidden="true"><image href={assetUrl(eye.png)} width="32" height="16" /></svg><span>{String(eye.number).padStart(2, "0")} {eye.label}</span>
    </button>)}
  </div>;
}
