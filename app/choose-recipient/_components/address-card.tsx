"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shownAddress, useWallet } from "@/app/(tabs)/_components/wallet";
import { RESOLVE_DELAY_MS, isHandle, isMistyped, lookupRecipient, looksLikeRecipient, reviewHref, sendDraft } from "../data";
import { CloseIcon, PasteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { iconPop } from "./motion";
import { StatusLine, type Status } from "./status-line";

const STATUS_ID = "recipient-status";

export function AddressCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // The sheet renders in a portal, client-only, so reading sessionStorage here is safe.
  const [value, setValue] = useState(() => sendDraft.get() ?? "");
  const resolution = useResolution(value.trim());
  const mine = shownAddress(useWallet());
  // Paying yourself moves nothing, yet would read as a payment in History.
  const status: Status = resolution.kind === "resolved" && resolution.address.toLowerCase() === mine?.toLowerCase() ? { kind: "own" } : resolution;
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
    // The whole field focuses the input; pressing one of its buttons leaves it alone.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (resolved) router.push(reviewHref(value.trim()), { transitionTypes: ["push"] });
      }}
      onClick={(event) => {
        if (!(event.target as Element).closest("button")) inputRef.current?.focus();
      }}
      className="px-6 pt-4"
    >
      <div className="flex h-14 items-center gap-2 rounded-2xl bg-secondary pr-2.5 pl-4 ring-brand/40 transition-[background-color,box-shadow] duration-150 ease-out ring-inset has-[input:focus]:bg-background has-[input:focus]:ring-[1.5px]">
        <input
          ref={inputRef}
          data-vaul-no-drag
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Address or ENS name"
          aria-describedby={STATUS_ID}
          placeholder="Address or ENS name"
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-label font-normal caret-brand outline-none placeholder:text-muted-foreground"
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
              className="relative grid size-5 shrink-0 place-items-center rounded-full bg-faint text-background after:absolute after:-inset-3 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <CloseIcon size={16} />
            </motion.button>
          )}
        </AnimatePresence>
        <Button type="button" size="sm" variant="secondary" onClick={paste} className="h-8 gap-1.5 bg-background px-3 text-caption font-semibold hover:bg-background/70">
          <PasteIcon size={16} className="text-muted-foreground" />
          Paste
        </Button>
      </div>

      <div className="px-4">
        <StatusLine id={STATUS_ID} status={status} />
      </div>

      <Button type="submit" disabled={!resolved} className="mt-3 w-full">
        Continue
      </Button>
    </form>
  );
}

function useResolution(query: string): Status {
  const handle = isHandle(query);
  // A name that arrives filled in (back from the review) was already resolved: show it settled.
  const [settled, setSettled] = useState(() => (handle ? { query, result: lookupRecipient(query) } : null));

  useEffect(() => {
    if (!handle) return;
    // Each keystroke restarts the timer: this debounces and drops stale lookups in one go.
    const timer = setTimeout(() => setSettled({ query, result: lookupRecipient(query) }), RESOLVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, handle]);

  if (handle) return settled?.query === query ? settled.result : { kind: "resolving" };
  // An address is checked right here, so it settles at once.
  if (looksLikeRecipient(query)) return lookupRecipient(query);
  return isMistyped(query) ? { kind: "mistyped" } : { kind: "hint" };
}
