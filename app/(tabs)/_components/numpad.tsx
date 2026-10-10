import { BackIcon } from "@/components/icons";
import type { Key } from "./amount";

const keys: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];
const labels: Partial<Record<Key, string>> = { ".": "Decimal point", back: "Delete" };

/**
 * Tapped dozens of times per amount, so no motion: the key lights up the instant it's pressed and
 * fades on release. No double-tap zoom, and dragging across it never pulls the sheet down.
 * Keys never take focus: a keyboard types the amount directly, and Enter must not re-press the last key.
 */
export function Numpad({ onKey }: { onKey: (key: Key) => void }) {
  return (
    <div role="group" aria-label="Keypad" data-vaul-no-drag className="grid grid-cols-3">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          tabIndex={-1}
          aria-label={labels[key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey(key)}
          className="grid h-[clamp(48px,7.4dvh,64px)] touch-manipulation place-items-center rounded-[20px] text-title font-medium tabular-nums outline-none select-none transition-[background-color] duration-200 ease-out active:bg-black/[0.05] active:duration-0"
        >
          {key === "back" ? <BackIcon size={24} /> : key}
        </button>
      ))}
    </div>
  );
}
