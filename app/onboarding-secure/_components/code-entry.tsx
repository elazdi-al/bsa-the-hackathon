import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CODE_LENGTH, RESEND_SECONDS } from "../data";
import { snap } from "./motion";

type Props = {
  verifying: boolean;
  onComplete: () => void;
  onFocusChange: (focused: boolean) => void;
};

function Resend() {
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds === 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  return (
    <button
      type="button"
      disabled={seconds > 0}
      onClick={() => setSeconds(RESEND_SECONDS)}
      className="mt-4 h-7 rounded-full bg-[#f3f2f9] px-3 text-[15px] font-medium text-[#918f97] tabular-nums transition-[scale,color] duration-150 ease-out enabled:text-[#6f6a85] enabled:active:scale-[0.96]"
    >
      {seconds > 0 ? `Resend (${seconds}s)` : "Resend"}
    </button>
  );
}

/** One native one-time-code input, drawn as six slots. Any six digits pass the mock check. */
export function CodeEntry({ verifying, onComplete, onFocusChange }: Props) {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const focus = (next: boolean) => {
    setFocused(next);
    onFocusChange(next);
  };

  const change = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      input.current?.blur();
      onComplete();
    }
  };

  return (
    <>
      <Resend />
      <div className="relative mt-[60px] -mx-4 grid grid-cols-6 gap-1.5">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const digit = code[i];
          const current = focused && !verifying && i === code.length;
          return (
            <div
              key={i}
              className={`grid h-[52px] place-items-center rounded-xl text-[22px] font-medium tabular-nums transition-[box-shadow,color] duration-200 ${
                digit
                  ? verifying
                    ? "text-black/35"
                    : "text-black"
                  : current
                    ? "shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.1)]"
                    : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.04)]"
              }`}
            >
              {digit ? (
                <motion.span
                  initial={{ opacity: 0, filter: "blur(4px)", y: 4 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  transition={snap}
                >
                  {digit}
                </motion.span>
              ) : (
                current && (
                  <motion.span
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 1, times: [0, 0.5, 0.5, 1], repeat: Infinity, ease: "linear" }}
                    className="h-6 w-[2px] rounded-full bg-[#0a84ff]"
                  />
                )
              )}
            </div>
          );
        })}
        <input
          ref={input}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={CODE_LENGTH}
          aria-label="6-digit code"
          value={code}
          readOnly={verifying}
          onChange={(e) => change(e.target.value)}
          onFocus={() => focus(true)}
          onBlur={() => focus(false)}
          className="absolute inset-0 opacity-0"
        />
      </div>
    </>
  );
}
