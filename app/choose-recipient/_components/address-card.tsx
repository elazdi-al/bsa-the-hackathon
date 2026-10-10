"use client";

import { FileIcon, XCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RESOLVE_DELAY_MS, lookupRecipient, looksLikeRecipient, reviewHref, sendDraft, type Resolution } from "../data";
import { Button } from "@/components/ui/button";
import { iconPop } from "./motion";
import { StatusLine, type Status } from "./status-line";

const STATUS_ID = "recipient-status";

export function AddressCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // The sheet renders in a portal, client-only, so reading sessionStorage here is safe.
  const [value, setValue] = useState(() => sendDraft.get() ?? "");
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
    // The whole card focuses the input; pressing one of its buttons leaves the card still.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (resolved) router.push(reviewHref(value.trim()), { transitionTypes: ["push"] });
      }}
      onClick={(event) => {
        if (!(event.target as Element).closest("button")) inputRef.current?.focus();
      }}
      className="mx-[15px] mt-[10px] rounded-[22px] border bg-surface px-4 pt-[17px] pb-4 transition-[scale,background-color,border-color] duration-200 ease-out not-has-[button:active]:active:scale-[1.01] not-has-[button:active]:active:bg-white has-[input:focus]:border-fuse-blue/40 has-[input:focus]:bg-white"
    >
      <div className="flex h-[22px] items-center gap-3">
        <input
          ref={inputRef}
          data-vaul-no-drag
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
              variants={iconPop}
              initial="hidden"
              animate="shown"
              exit="hidden"
              whileTap={{ scale: 0.96 }}
              className="relative mb-1 grid size-4 place-items-center rounded-full text-black/20 after:absolute after:-inset-3.5 focus-visible:outline-2 focus-visible:outline-fuse-blue"
            >
              <XCircleIcon weight="fill" size={19} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <StatusLine id={STATUS_ID} status={status} />

      <div className="mt-[11px] flex gap-2">
        <Button type="submit" size="sm" disabled={!resolved}>
          Continue
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={paste} className="gap-1.5">
          <FileIcon weight="fill" size={14} />
          Paste
        </Button>
      </div>
    </form>
  );
}

function useResolution(query: string): Status {
  // A value that arrives filled in (back from the review) was already resolved: show it settled.
  const [settled, setSettled] = useState(() =>
    looksLikeRecipient(query) ? { query, result: lookupRecipient(query) } : null,
  );
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
