"use client";

import { FileIcon, XCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RESOLVE_DELAY_MS, lookupRecipient, looksLikeRecipient, type Resolution } from "../data";
import { iconPop, pressSpring } from "./motion";
import { StatusLine, type Status } from "./status-line";

const STATUS_ID = "recipient-status";

export function AddressCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const status = useResolution(value.trim());
  const resolved = status.kind === "resolved";

  function clear() {
    setValue("");
    inputRef.current?.focus();
  }

  async function paste() {
    try {
      setValue((await navigator.clipboard.readText()).trim());
    } catch {
      // No clipboard access (unsupported or denied): fall back to a native paste.
      inputRef.current?.focus();
    }
  }

  return (
    <motion.form
      onSubmit={(event) => {
        event.preventDefault();
        if (resolved) router.push("/send-hide-my-wallet");
      }}
      onTap={() => inputRef.current?.focus()}
      whileTap={{ scale: 1.01, backgroundColor: "#ffffff" }}
      transition={pressSpring}
      className="mx-[15px] mt-[10px] rounded-[22px] bg-[#fbfbfb] px-4 pt-[17px] pb-4 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.12),0_0_28px_rgb(0_0_0/0.05)]"
    >
      <div className="flex h-[22px] items-center gap-3">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Address or .sol handle"
          aria-describedby={STATUS_ID}
          placeholder="Address or .sol handle"
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-black caret-fuse-blue outline-none placeholder:text-black/30"
        />
        <AnimatePresence initial={false}>
          {value && (
            <motion.button
              key="clear"
              type="button"
              aria-label="Clear"
              onClick={clear}
              propagate={{ tap: false }}
              variants={iconPop}
              initial="hidden"
              animate="shown"
              exit="hidden"
              className="relative mb-1 grid size-4 place-items-center rounded-full text-[#d4d4d4] after:absolute after:-inset-3.5 focus-visible:outline-2 focus-visible:outline-fuse-blue"
            >
              <XCircleIcon weight="fill" size={19} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <StatusLine id={STATUS_ID} status={status} />

      <div className="mt-[11px] flex gap-2">
        <motion.button
          type="submit"
          disabled={!resolved}
          whileTap={{ scale: 0.96 }}
          propagate={{ tap: false }}
          className="h-[34px] rounded-full bg-black px-5 text-[14px] font-medium tracking-[-0.035em] text-white transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuse-blue disabled:bg-[#a7a7a7]"
        >
          Continue
        </motion.button>
        <motion.button
          type="button"
          onClick={paste}
          whileTap={{ scale: 0.96 }}
          propagate={{ tap: false }}
          className="flex h-[34px] items-center gap-1.5 rounded-full bg-[#f4f4f4] px-5 text-[14px] font-medium tracking-[-0.035em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuse-blue"
        >
          <FileIcon weight="bold" size={14} />
          Paste
        </motion.button>
      </div>
    </motion.form>
  );
}

function useResolution(query: string): Status {
  const [settled, setSettled] = useState<{ query: string; result: Resolution } | null>(null);
  const resolvable = looksLikeRecipient(query);

  useEffect(() => {
    if (!resolvable) return;
    // Each keystroke restarts the timer: this debounces and drops stale lookups in one go.
    const timer = setTimeout(() => setSettled({ query, result: lookupRecipient(query) }), RESOLVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, resolvable]);

  if (!resolvable) return { kind: "hint" };
  return settled?.query === query ? settled.result : { kind: "resolving" };
}
