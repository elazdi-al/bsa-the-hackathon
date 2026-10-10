import { AnimatePresence, motion } from "motion/react";
import { blurred, leave, sharp } from "@/app/(tabs)/_components/transitions";
import { CheckCircleIcon, ClockIcon, CoinIcon, FaceIdIcon, PayoutIcon, SendIcon, type Icon } from "@/components/icons";
import type { Step, StepId } from "../data";
import { CopyButton } from "./copy-button";

const hidden = { opacity: 0, filter: blurred };
const shown = { opacity: 1, filter: sharp, y: 0 };

/** `step` indexes `steps`; `expanded` shows the full tracker instead of the single status row. */
export type Tracker = { step: number; expanded: boolean };

const icons: Record<StepId, Icon> = {
  awaiting: ClockIcon,
  received: CoinIcon,
  payout: PayoutIcon,
  signed: FaceIdIcon,
  submitted: SendIcon,
  completed: CheckCircleIcon,
};

function tone(steps: Step[], index: number, current: number) {
  if (index !== current) return "text-muted-foreground";
  return index === steps.length - 1 ? "text-positive" : "text-fuse-blue";
}

/** A step's glyph and label. Stable layout ids let the current one travel between the tracker and the folded row. */
function StepMark({ step, reverse }: { step: Step; reverse?: boolean }) {
  const { id, label } = step;
  const StepIcon = icons[id];
  return (
    <span className={`flex items-center ${reverse ? "flex-row-reverse gap-1.5" : "gap-3"}`}>
      <motion.span layoutId={`${id}-icon`} className="flex">
        <StepIcon size={16} />
      </motion.span>
      <motion.span layoutId={`${id}-label`}>{label}</motion.span>
    </span>
  );
}

type Props = { steps: Step[]; tracker: Tracker; summary: string; onToggle: () => void };

export function StatusCard({ steps, tracker, summary, onToggle }: Props) {
  const { step, expanded } = tracker;

  return (
    <motion.div layout="position" className="relative mt-6 px-4">
      <div className="relative flex h-9 items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="status-steps"
          className="text-muted-foreground outline-none transition-transform duration-150 ease-out active:scale-[0.96] after:absolute after:-inset-x-4 after:inset-y-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          Status<span className="sr-only">: {steps[step].label}</span>
        </button>
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div key="copy" className="text-muted-foreground" initial={hidden} animate={shown} exit={{ ...hidden, transition: leave }}>
              <CopyButton text={summary} label="Copy details">
                Copy details
              </CopyButton>
            </motion.div>
          ) : (
            <span key="current" className={`pointer-events-none font-medium transition-colors ${tone(steps, step, step)}`}>
              <StepMark step={steps[step]} reverse />
            </span>
          )}
        </AnimatePresence>
      </div>

      <ol id="status-steps">
        {/* Popped out of flow so the card folds at once. The current step leaves no ghost: its mark flies to the header. */}
        <AnimatePresence initial={false} mode="popLayout">
          {expanded &&
            steps.map((s, i) => (
              <motion.li
                key={s.id}
                className={`relative flex h-8 items-center transition-colors duration-200 ${tone(steps, i, step)}`}
                initial={i === step ? false : { ...hidden, y: -12 }}
                animate={shown}
                exit={i === step ? undefined : { ...hidden, y: -16, transition: leave }}
              >
                {i > 0 && <span aria-hidden className="absolute -top-2 left-[7.5px] h-4 w-px bg-faint/50" />}
                <StepMark step={s} />
                {i === step && <span className="sr-only"> (current)</span>}
              </motion.li>
            ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  );
}
