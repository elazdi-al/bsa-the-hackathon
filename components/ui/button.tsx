import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const variants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-label whitespace-nowrap outline-hidden select-none transition-[scale,background-color,color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.96] data-disabled:pointer-events-none disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "bg-secondary text-secondary-foreground hover:bg-black/[0.07]",
        ghost: "hover:bg-muted",
        inverse: "bg-white text-black hover:bg-white/90",
        destructive: "bg-negative text-white hover:bg-negative/85",
      },
      size: {
        default: "h-12 px-6",
        sm: "h-9 px-4 text-body font-semibold",
        lg: "h-13 px-7",
        icon: "size-11",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Merged here, so a caller's className (a Link styled as a button) overrides the variant's classes.
const buttonVariants = (props?: Parameters<typeof variants>[0]) => cn(variants(props))

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
