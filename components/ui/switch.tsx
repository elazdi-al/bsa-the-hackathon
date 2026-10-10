"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

// Flat track and knob. The knob stretches toward its travel while pressed and settles on release.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-7 w-12 shrink-0 touch-manipulation items-center rounded-full px-0.5 outline-hidden transition-colors duration-200 ease-out after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-fuse-blue data-unchecked:bg-black/15 data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-6 w-6 rounded-full bg-white transition-[translate,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-active/switch:w-[30px] data-checked:translate-x-5 group-active/switch:data-checked:translate-x-[14px] motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
