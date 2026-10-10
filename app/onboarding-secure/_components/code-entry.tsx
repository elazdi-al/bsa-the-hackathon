import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useEffect, useRef, useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { CODE_LENGTH, RESEND_SECONDS } from "../data";

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
      className="relative mt-4 h-7 rounded-full bg-secondary px-3 text-caption font-semibold text-muted-foreground tabular-nums outline-none transition-[scale,color] duration-150 ease-out after:absolute after:-inset-x-1 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring enabled:text-foreground enabled:active:scale-[0.96]"
    >
      {seconds > 0 ? `Resend (${seconds}s)` : "Resend"}
    </button>
  );
}

/** Any six digits pass the mock check. */
export function CodeEntry({ verifying, onComplete, onFocusChange }: Props) {
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Resend />
      <InputOTP
        ref={input}
        maxLength={CODE_LENGTH}
        pattern={REGEXP_ONLY_DIGITS}
        value={code}
        onChange={setCode}
        onComplete={() => {
          input.current?.blur();
          onComplete();
        }}
        autoFocus
        aria-label="6-digit code"
        readOnly={verifying}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        containerClassName="mt-[60px] -mx-4"
      >
        <InputOTPGroup>
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <InputOTPSlot key={i} index={i} className={verifying ? "text-muted-foreground" : undefined} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </>
  );
}
