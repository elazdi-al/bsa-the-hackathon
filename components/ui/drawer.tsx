"use client"

import * as React from "react"
import { cn } from "cn"
import { Drawer as DrawerPrimitive } from "vaul"
import { BackButton } from "./back-button"

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-black/25", className)}
      {...props}
    />
  )
}

// Bottom sheet on phones; from `sm` up it floats, centred, with a gap below.
function DrawerContent({
  className,
  children,
  overlayClassName,
  handle = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { overlayClassName?: string; handle?: boolean }) {
  // Radix hands focus back only to a DrawerTrigger. Most sheets open from a plain button, so remember
  // what was focused on open and return there; an opener that has since unmounted is the caller's job.
  const opener = React.useRef<HTMLElement | null>(null)
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay className={overlayClassName} />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] flex-col rounded-t-[32px] bg-background text-foreground outline-none sm:inset-x-4 sm:[--initial-transform:calc(100%+16px)] sm:bottom-4 sm:mx-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-[32px] sm:after:hidden",
          className
        )}
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement as HTMLElement | null
          onOpenAutoFocus?.(e)
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          if (e.defaultPrevented || !opener.current?.isConnected) return
          e.preventDefault()
          opener.current.focus()
        }}
        {...props}
      >
        {handle && <div aria-hidden className="mx-auto mt-2.5 h-[5px] w-9 shrink-0 rounded-full bg-black/10" />}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

// A grey card floating clear of the screen edges, for detail sheets (history, withdrawal tracking).
function FloatingSheetContent({
  className,
  ...props
}: React.ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent
      aria-describedby={undefined}
      handle={false}
      className={cn(
        "inset-x-5 bottom-(--gap) max-h-[calc(100dvh-env(safe-area-inset-top)-12px-var(--gap))] rounded-[34px] bg-[#f2f2f2] text-[13.5px] leading-5 after:hidden [--gap:max(20px,calc(env(safe-area-inset-bottom)+6px))] [--initial-transform:calc(100%+var(--gap))] sm:rounded-[34px] sm:[--gap:1rem]",
        className
      )}
      {...props}
    />
  )
}

// Handle, close, icon and title; whatever follows the title (amount, date) comes in as children.
function FloatingSheetHeader({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="relative flex flex-col items-center pt-[47px] text-center">
      <span aria-hidden className="absolute top-2.5 h-[5px] w-9 rounded-full bg-black/10" />
      <DrawerClose asChild>
        <BackButton kind="close" className="absolute top-3.5 -right-0.5" />
      </DrawerClose>
      {icon}
      <DrawerTitle className="mt-3 text-[13.5px] font-medium tracking-normal text-[#a5a5a5]">
        {title}
      </DrawerTitle>
      {children}
    </header>
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-[18px] font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-[15px] leading-5 text-pretty text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  FloatingSheetContent,
  FloatingSheetHeader,
  DrawerTitle,
  DrawerDescription,
}
