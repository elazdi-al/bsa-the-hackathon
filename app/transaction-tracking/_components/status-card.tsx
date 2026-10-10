import {
  ArrowCircleDownIcon,
  CheckCircleIcon,
  ClockIcon,
  PaperPlaneTiltIcon,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { blurred, leave, sharp } from "@/app/(tabs)/_components/transitions";
import { steps, type StepId } from "../data";
import { CopyButton } from "./copy-button";

const hidden = { opacity: 0, filter: blurred };
const shown = { opacity: 1, filter: sharp, y: 0 };

/** `step` indexes `steps`; `expanded` shows the full tracker instead of the single status row. */
export type Tracker = { step: number; expanded: boolean };

// Phosphor has no circled paper plane; draw the disc to match the circled glyphs around it.
function PayoutIcon({ size }: IconProps) {
  return (
    <span className="grid place-items-center" style={{ width: size, height: size }}>
      <span className="grid size-[81%] place-items-center rounded-full bg-current">
        <PaperPlaneTiltIcon weight="fill" className="size-[58%] text-[#f2f2f2]" />
      </span>
    </span>
  );
}

const icons: Record<StepId, Icon | typeof PayoutIcon> = {
  awaiting: ClockIcon,
  received: ArrowCircleDownIcon,
  payout: PayoutIcon,
  completed: CheckCircleIcon,
};

function tone(index: number, current: number) {
  if (index !== current) return "text-[#a3a3a3]";
  return index === steps.length - 1 ? "text-[#30d158]" : "text-[#1171ee]";
}

/** A step's glyph and label. Stable layout ids let the current one travel between the tracker and the folded row. */
function StepMark({ index, reverse }: { index: number; reverse?: boolean }) {
  const { id, label } = steps[index];
  const StepIcon = icons[id];
  return (
    <span className={`flex items-center ${reverse ? "flex-row-reverse gap-[7px]" : "gap-2.5"}`}>
      <motion.span layoutId={`${id}-icon`} className="flex">
        <StepIcon size={18} weight="fill" />
      </motion.span>
      <motion.span layoutId={`${id}-label`}>{label}</motion.span>
    </span>
  );
}

export function StatusCard({ tracker, summary, onToggle }: { tracker: Tracker; summary: string; onToggle: () => void }) {
  const { step, expanded } = tracker;

  return (
    <motion.div layout="position" className="relative mt-6 px-4 pb-[7px]">
      <motion.div
        layout
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ borderRadius: 18, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.035), 0 2px 6px rgb(0 0 0 / 0.02)" }}
      />
      <div className="relative flex h-[43px] items-start justify-between pt-[15px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="status-steps"
          className="font-medium outline-none after:absolute after:-inset-x-4 after:top-0 after:-bottom-[7px] after:rounded-[18px] focus-visible:after:ring-2 focus-visible:after:ring-[#1171ee]"
        >
          Status<span className="sr-only">: {steps[step].label}</span>
        </button>
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div key="copy" className="text-[#a5a5a5]" initial={hidden} animate={shown} exit={{ ...hidden, transition: leave }}>
              <CopyButton text={summary} label="Copy details">
                Copy details
              </CopyButton>
            </motion.div>
          ) : (
            <span key="current" className={`pointer-events-none text-[12.5px] transition-colors ${tone(step, step)}`}>
              <StepMark index={step} reverse />
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
                className={`relative flex h-[31px] items-center text-[12.5px] transition-colors duration-200 ${tone(i, step)}`}
                initial={i === step ? false : { ...hidden, y: -12 }}
                animate={shown}
                exit={i === step ? undefined : { ...hidden, y: -16, transition: leave }}
              >
                {i > 0 && <span aria-hidden className="absolute -top-[5px] left-[8.5px] h-2.5 w-px bg-[#dadada]" />}
                <StepMark index={i} />
                {i === step && <span className="sr-only"> (current)</span>}
              </motion.li>
            ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  );
}
