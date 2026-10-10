import { AnimatePresence, motion } from "motion/react";
import { CheckCircleIcon } from "@/components/icons";
import { HOLDERS } from "../data";
import type { Step } from "../flow";
import { iconSwap } from "./motion";

const accent = "var(--color-orange)";

/** The Wallet Key's three holders. They breathe while the key is split, then each takes its part in turn. */
export function Holders({ status }: { status: Extract<Step, { name: "key" }>["status"] }) {
  const landed = status === "split";
  return (
    <ul className="mt-6 grid grid-cols-3">
      {HOLDERS.map(({ name, Icon }, i) => {
        const delay = i * 0.15;
        // Accents are CSS variables, which Motion can't tween, so colour changes ride a CSS transition.
        const stagger = { transitionDelay: `${delay}s` };
        return (
          <li key={name} className="flex flex-col items-start">
            <span
              className={`relative transition-[color] duration-300 ease-out ${landed ? "" : "text-muted-foreground"}`}
              style={landed ? { ...stagger, color: accent } : stagger}
            >
              <motion.span
                className="block"
                animate={{ opacity: status === "working" ? [1, 0.35, 1] : 1 }}
                transition={
                  status === "working"
                    ? { duration: 1.2, ease: "easeInOut", repeat: Infinity, delay: i * 0.2 }
                    : { duration: 0.2 }
                }
              >
                <Icon size={28} className="block" />
              </motion.span>
              <AnimatePresence initial={false}>
                {landed && (
                  <motion.span
                    {...iconSwap}
                    transition={{ ...iconSwap.transition, delay }}
                    className="absolute -right-2 -bottom-1 rounded-full bg-white ring-2 ring-white"
                  >
                    <CheckCircleIcon size={16} className="block" style={{ color: accent }} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span
              className={`mt-2 text-caption transition-[color] duration-300 ease-out ${landed ? "text-foreground" : "text-muted-foreground"}`}
              style={stagger}
            >
              {name}
              {landed && <span className="sr-only"> holds its part</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
