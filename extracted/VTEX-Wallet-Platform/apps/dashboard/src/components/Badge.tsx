// Tremor Raw Badge [v0.0.0]

import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx } from "@/lib/utils"

const badgeVariants = tv({
  // Leg Day : pastille pleine (jamais de liseré), rayon 999, pastille de couleur en tête.
  base: cx(
    "inline-flex items-center gap-x-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11.5px] font-bold leading-none before:size-2 before:rounded-full before:bg-current before:opacity-80 before:content-['']",
  ),
  variants: {
    variant: {
      default: "bg-[#EAEDFF] text-[#3a4380]",
      neutral: "bg-[#EEEFF5] text-[#4d5378]",
      success: "bg-[#E7F7DC] text-[#2D7A1A]",
      error: "bg-[#FDE7EA] text-[#A8323E]",
      warning: "bg-[#FEF3E1] text-[#8A6930]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})
interface BadgeProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }: BadgeProps, forwardedRef) => {
    return (
      <span
        ref={forwardedRef}
        className={cx(badgeVariants({ variant }), className)}
        {...props}
      />
    )
  },
)

Badge.displayName = "Badge"

export { Badge, badgeVariants, type BadgeProps }
