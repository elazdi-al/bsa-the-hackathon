"use client"

import * as React from "react"
import { cn } from "cn"
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useReducedMotion } from "motion/react"
import { Drawer as DrawerPrimitive } from "vaul"
import { BackIcon, CloseIcon } from "@/components/icons"
import { BackButton } from "./back-button"
import { Drawer, DrawerClose, FloatingSheetContent } from "./drawer"

const easeOut = [0.23, 1, 0.32, 1] as const
const settle = { type: "spring", duration: 0.3, bounce: 0 } as const

// Blur bridges the two overlapping views so the swap reads as one surface changing, not two crossing.
const morph = {
  shown: { opacity: 1, scale: 1, filter: "blur(0px)" },
  hidden: { opacity: 0, scale: 0.96, filter: "blur(4px)" },
}
const fade = { shown: { opacity: 1 }, hidden: { opacity: 0 } }
const morphGlyphOff = { opacity: 0, scale: 0.25, filter: "blur(4px)" }

function focusTitle(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>("[data-tray-view]:not([inert]) [data-tray-title]")?.focus({ preventScroll: true })
}

/**
 * A floating card whose views replace each other in place, the card's height following the view.
 * The caller owns the view stack: `view` keys the current view (rendered as children), `onBack` is
 * passed on sub-views (it turns the corner button and Escape into "back"), and `onClosed` fires once
 * the close animation has finished, the moment to reset the stack.
 */
function Tray({
  open,
  onOpenChange,
  view,
  onBack,
  onClosed,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: string
  onBack?: () => void
  onClosed?: () => void
  children: React.ReactNode
}) {
  const card = React.useRef<HTMLDivElement>(null)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <FloatingSheetContent
        ref={card}
        className="inset-x-4 mx-auto max-w-[400px] overflow-hidden rounded-[36px] bg-white text-[15px] leading-5 sm:max-w-[400px] sm:rounded-[36px] motion-reduce:data-[state=closed]:[animation-name:fadeOut]! motion-reduce:data-[state=open]:[animation-name:fadeIn]!"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          focusTitle(card.current)
        }}
        onEscapeKeyDown={(e) => {
          if (!onBack) return
          e.preventDefault()
          onBack()
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.currentTarget.dataset.state === "closed") onClosed?.()
        }}
      >
        <TrayCard view={view} onBack={onBack}>
          {children}
        </TrayCard>
      </FloatingSheetContent>
    </Drawer>
  )
}

// Mounts with each open, so the first measurement of every open lands without animating.
function TrayCard({ view, onBack, children }: { view: string; onBack?: () => void; children: React.ReactNode }) {
  const reduced = useReducedMotion() ?? false
  const scroller = React.useRef<HTMLDivElement>(null)
  const content = React.useRef<HTMLDivElement>(null)
  const height = useMotionValue<number | "auto">("auto")
  const [overflows, setOverflows] = React.useState(false)
  const shown = React.useRef(view)
  const glyphOff = reduced ? fade.hidden : morphGlyphOff

  React.useLayoutEffect(() => {
    const box = scroller.current!
    let measured = false
    const observer = new ResizeObserver(([entry]) => {
      const natural = entry.borderBoxSize[0].blockSize
      const cap = parseFloat(getComputedStyle(box.parentElement!).maxHeight)
      const next = Math.min(natural, cap)
      setOverflows(natural > cap)
      if (measured && !reduced) animate(height, next, settle)
      else height.jump(next)
      measured = true
    })
    observer.observe(content.current!)
    return () => observer.disconnect()
  }, [height, reduced])

  React.useEffect(() => {
    if (shown.current === view) return
    shown.current = view
    scroller.current!.scrollTop = 0
    focusTitle(scroller.current)
  }, [view])

  return (
    <>
      <DrawerClose asChild>
        <BackButton
          kind={onBack ? "back" : "close"}
          className="absolute top-4 right-4 z-10 bg-secondary"
          onClick={(e) => {
            if (!onBack) return
            e.preventDefault()
            onBack()
          }}
        >
          <span className="grid *:col-start-1 *:row-start-1">
            <motion.span initial={false} animate={onBack ? glyphOff : morph.shown} transition={settle}>
              <CloseIcon size={20} />
            </motion.span>
            <motion.span initial={false} animate={onBack ? morph.shown : glyphOff} transition={settle}>
              <BackIcon size={20} />
            </motion.span>
          </span>
        </BackButton>
      </DrawerClose>
      <motion.div
        ref={scroller}
        style={{ height }}
        className={cn("min-h-0 overscroll-contain", overflows ? "overflow-y-auto" : "overflow-hidden")}
      >
        <div ref={content} className="relative px-6 pt-4 pb-6">
          <AnimatePresence initial={false} mode="popLayout">
            <TrayView key={view} reduced={reduced}>
              {children}
            </TrayView>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}

function TrayView({
  ref,
  reduced,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>
  reduced: boolean
  children: React.ReactNode
}) {
  const present = useIsPresent()
  const { shown, hidden } = reduced ? fade : morph
  return (
    <motion.div
      ref={ref}
      data-tray-view=""
      inert={!present}
      initial={hidden}
      animate={{ ...shown, transition: { duration: 0.25, ease: easeOut } }}
      exit={{ ...hidden, transition: { duration: 0.15, ease: easeOut } }}
    >
      {children}
    </motion.div>
  )
}

// Optional icon, then the title that names the dialog (and takes focus on each view), then a grey line.
function TrayHeader({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
}) {
  // A leaving view drops its ids so the dialog's name and description point at the arriving view.
  // vaul's bare Title and Description: DrawerTitle's base size, weight and tracking would override the type tokens.
  const leaving = useIsPresent() ? null : { id: undefined }
  return (
    <header className="flex flex-col items-start">
      {icon}
      <DrawerPrimitive.Title
        data-tray-title=""
        tabIndex={-1}
        {...leaving}
        className={cn("text-heading text-balance outline-none", icon ? "mt-4" : "py-1.5 pr-12")}
      >
        {title}
      </DrawerPrimitive.Title>
      {description && (
        <DrawerPrimitive.Description {...leaving} className="mt-2 text-body text-pretty text-muted-foreground">
          {description}
        </DrawerPrimitive.Description>
      )}
    </header>
  )
}

// One or two pill buttons sharing the row equally, e.g. a secondary Cancel and the primary action.
function TrayActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-7 flex gap-3 *:flex-1">{children}</div>
}

export { Tray, TrayHeader, TrayActions }
