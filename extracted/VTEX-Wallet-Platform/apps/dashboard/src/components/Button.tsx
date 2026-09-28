// Tremor Raw Button [v0.1.1] — habillé Leg Day : pilule, dégradé 158° à trois paliers, matière (liseré + ombre), jamais de trait.

"use client"

import { Slot } from "@radix-ui/react-slot"
import { SpinnerGap } from "@phosphor-icons/react"
import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, focusRing } from "@/lib/utils"

const buttonVariants = tv({
  base: [
    // base
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-full border-0 px-5 py-2.5 text-center text-sm font-bold shadow-none transition-all duration-150 ease-in-out sm:text-sm",
    // disabled
    "disabled:pointer-events-none disabled:shadow-none",
    // focus
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        "text-white",
        "bg-[linear-gradient(158deg,#2F3670_0%,#252B5B_55%,#171B3D_100%)]",
        "shadow-[0_10px_28px_-10px_rgba(15,18,48,0.45),inset_0_1px_0_rgba(255,255,255,0.16)]",
        "hover:brightness-110",
        "active:scale-[.97]",
        "disabled:bg-none disabled:bg-[#e4e6f2] disabled:text-[#9da5be]",
      ],
      secondary: [
        "text-[#252B5B]",
        "bg-[linear-gradient(158deg,#F4F6FF_0%,#EAEDFF_55%,#D5DAFF_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(15,18,48,0.06),0_3px_8px_-2px_rgba(15,18,48,0.14)]",
        "hover:brightness-[.97]",
        "active:scale-[.97]",
        "disabled:bg-none disabled:bg-[#eef0f8] disabled:text-[#9da5be]",
      ],
      light: [
        "text-[#0a0d1e]",
        "bg-[linear-gradient(158deg,#E5E3DA_0%,#DCDAD0_55%,#CFCCC0_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_8px_-2px_rgba(15,18,48,0.14)]",
        "hover:brightness-[.97]",
        "active:scale-[.97]",
        "disabled:bg-none disabled:bg-[#eef0f8] disabled:text-[#9da5be]",
      ],
      ghost: [
        "text-[#4d5378]",
        "bg-transparent hover:bg-[#f0f2fb] hover:text-[#0a0d1e]",
        "active:scale-[.97]",
        "disabled:text-[#9da5be]",
      ],
      // Une action destructive reste rouge en toute circonstance (RULE 008).
      destructive: [
        "text-white",
        "bg-[linear-gradient(158deg,#F47882_0%,#EF5A67_55%,#C9404D_100%)]",
        "shadow-[0_10px_28px_-10px_rgba(201,64,77,0.5),inset_0_1px_0_rgba(255,255,255,0.22)]",
        "hover:brightness-105",
        "active:scale-[.97]",
        "disabled:bg-none disabled:bg-[#f7c5cb]",
      ],
    },
  },
  defaultVariants: {
    variant: "primary",
  },
})

interface ButtonProps
  extends React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const Component = asChild ? Slot : "button"
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <SpinnerGap
              className="size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">
              {loadingText ? loadingText : "Chargement"}
            </span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    )
  },
)

Button.displayName = "Button"

export { Button, buttonVariants, type ButtonProps }
