import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Tamaños pensados para el dedo: el default mide 44px (guía de Apple para áreas táctiles).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        outline: "border-border bg-card text-foreground hover:bg-accent aria-expanded:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost: "text-foreground hover:bg-accent aria-expanded:bg-accent",
        destructive: "bg-negative-soft text-negative hover:bg-negative/12",
        positive: "bg-positive text-white hover:bg-positive/90",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-4 text-[15px]",
        sm: "h-9 gap-1.5 rounded-lg px-3 text-sm",
        xs: "h-7 gap-1 rounded-md px-2 text-xs",
        lg: "h-12 gap-2 px-5 text-base",
        icon: "size-11",
        "icon-sm": "size-9 rounded-lg",
        "icon-xs": "size-7 rounded-md",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
