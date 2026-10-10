import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { iconSwap } from "./motion";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Props = {
  sending: boolean;
  onSubmit: (email: string) => void;
  onFocusChange: (focused: boolean) => void;
};

export function EmailForm({ sending, onSubmit, onFocusChange }: Props) {
  const [email, setEmail] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const valid = EMAIL.test(email.trim());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || sending) return;
    // Drop the keyboard while the code is sent, as the reference does.
    input.current?.blur();
    onSubmit(email.trim());
  };

  return (
    <form
      onSubmit={submit}
      className="flex h-[52px] items-center rounded-full bg-secondary pr-2 pl-6 ring-inset transition-shadow duration-200 focus-within:ring-2 focus-within:ring-foreground"
    >
      <input
        ref={input}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="send"
        aria-label="Email"
        placeholder="Enter your email"
        value={email}
        readOnly={sending}
        onChange={(e) => setEmail(e.target.value)}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        className="min-w-0 flex-1 bg-transparent text-label font-normal caret-fuse-blue outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Send code"
        aria-busy={sending}
        disabled={!valid || sending}
        className={`relative grid h-9 w-12 place-items-center after:absolute after:-inset-1 ${sending ? "disabled:opacity-100" : ""}`}
      >
        <AnimatePresence initial={false}>
          <motion.span key={sending ? "spin" : "arrow"} {...iconSwap} className="col-start-1 row-start-1">
            {sending ? <Spinner aria-hidden /> : <ArrowRightIcon size={20} />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </form>
  );
}
