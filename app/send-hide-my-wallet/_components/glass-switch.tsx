import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { fade, springs } from "./motion";

// Track 63×28 with a 2px inset around a 38×24 knob.
const TRAVEL = 21;
// How long the knob stays a glass lens after a toggle, covering the travel.
const LENS_MS = 260;

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
};

export function GlassSwitch({ checked, onCheckedChange, disabled, labelledBy }: Props) {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const [travelling, setTravelling] = useState(false);

  useEffect(() => {
    if (!travelling) return;
    const id = setTimeout(() => setTravelling(false), LENS_MS);
    return () => clearTimeout(id);
  }, [travelling, checked]);

  const lens = !reduceMotion && !disabled && (pressed || travelling);
  const release = () => setPressed(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => {
        onCheckedChange(!checked);
        setTravelling(true);
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      className="relative h-7 w-[63px] shrink-0 touch-manipulation rounded-full bg-[#b5b3b6] outline-offset-4 outline-fuse-blue select-none after:absolute after:-inset-2 focus-visible:outline-2 disabled:opacity-60"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-fuse-blue"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={fade}
      />
      <motion.span
        aria-hidden
        className="absolute top-0.5 left-0.5 h-6 w-[38px] rounded-full"
        initial={false}
        animate={{ x: checked ? TRAVEL : 0, scaleX: lens ? 1.55 : 1, scaleY: lens ? 1.45 : 1 }}
        transition={{ x: springs.knob, default: springs.lens }}
      >
        <motion.span
          className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
          initial={false}
          animate={{ opacity: lens ? 0 : 1 }}
          transition={fade}
        />
        <motion.span
          className="absolute inset-0 rounded-full bg-white/25 shadow-[inset_0_0_0_0.75px_rgb(255_255_255/0.85),inset_0_2px_2px_rgb(255_255_255/0.9),inset_0_-2px_2px_rgb(255_255_255/0.9),inset_1.5px_0_2px_rgb(255_255_255/0.5),inset_-1.5px_0_2px_rgb(255_255_255/0.5),0_0_0_0.75px_rgb(70_50_150/0.35),0_4px_10px_rgb(0_0_0/0.12)] backdrop-blur-[1px]"
          initial={false}
          animate={{ opacity: lens ? 1 : 0 }}
          transition={fade}
        />
      </motion.span>
    </button>
  );
}
