// Tremor Raw Input [v1.0.3]

import { Eye, EyeSlash, MagnifyingGlass } from "@phosphor-icons/react"
import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, focusRing } from "@/lib/utils"

const inputStyles = tv({
  base: [
    // Leg Day : surface pleine, rayon 14, aucun trait — l'état actif se lit par l'anneau interne, pas par une bordure.
    "relative block w-full appearance-none truncate rounded-[14px] border-0 px-4 py-[11px] font-medium shadow-none outline-none transition sm:text-sm",
    "text-[#0a0d1e]",
    "placeholder-[#9da5be]",
    "bg-[#f0f2fb] hover:bg-[#ebeefa] focus:bg-white",
    "focus:shadow-[inset_0_0_0_2px_#8ea9ff,0_6px_16px_-8px_rgba(90,107,216,0.5)]",
    // disabled
    "disabled:bg-[#eef0f8] disabled:text-[#9da5be]",
    // file
    [
      "file:-my-2 file:-ml-2.5 file:cursor-pointer file:rounded-l-[5px] file:rounded-r-none file:border-0 file:px-3 file:py-2 file:outline-none focus:outline-none disabled:pointer-events-none file:disabled:pointer-events-none",
      "file:border-solid file:border-gray-300 file:bg-gray-50 file:text-gray-500 file:hover:bg-gray-100",
      "file:[border-inline-end-width:1px] file:[margin-inline-end:0.75rem]",
      "file:disabled:bg-gray-100 file:disabled:text-gray-500",
    ],
    // remove search cancel button (optional)
    "[&::--webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
  ],
  variants: {
    hasError: {
      true: "shadow-[inset_0_0_0_2px_#ef5a67] focus:shadow-[inset_0_0_0_2px_#ef5a67]",
    },
    // number input
    enableStepper: {
      false:
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    },
  },
})
interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputStyles> {
  inputClassName?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      inputClassName,
      hasError,
      enableStepper = true,
      type,
      ...props
    }: InputProps,
    forwardedRef,
  ) => {
    const [typeState, setTypeState] = React.useState(type)

    const isPassword = type === "password"
    const isSearch = type === "search"

    return (
      <div className={cx("relative w-full", className)}>
        <input
          ref={forwardedRef}
          type={isPassword ? typeState : type}
          className={cx(
            inputStyles({ hasError, enableStepper }),
            {
              "pl-8": isSearch,
              "pr-10": isPassword,
            },
            inputClassName,
          )}
          {...props}
        />
        {isSearch && (
          <div
            className={cx(
              // base
              "pointer-events-none absolute bottom-0 left-2 flex h-full items-center justify-center",
              // text color
              "text-gray-400 dark:text-gray-600",
            )}
          >
            <MagnifyingGlass
              className="size-[1.125rem] shrink-0"
              aria-hidden="true"
            />
          </div>
        )}
        {isPassword && (
          <div
            className={cx(
              "absolute bottom-0 right-0 flex h-full items-center justify-center px-3",
            )}
          >
            <button
              aria-label="Change password visibility"
              className={cx(
                // base
                "h-fit w-fit rounded-sm outline-none transition-all",
                // text
                "text-gray-400 dark:text-gray-600",
                // hover
                "hover:text-gray-500 hover:dark:text-gray-500",
                focusRing,
              )}
              type="button"
              onClick={() => {
                setTypeState(typeState === "password" ? "text" : "password")
              }}
            >
              <span className="sr-only">
                {typeState === "password" ? "Show password" : "Hide password"}
              </span>
              {typeState === "password" ? (
                <Eye aria-hidden="true" className="size-5 shrink-0" />
              ) : (
                <EyeSlash aria-hidden="true" className="size-5 shrink-0" />
              )}
            </button>
          </div>
        )}
      </div>
    )
  },
)

Input.displayName = "Input"

export { Input, inputStyles, type InputProps }
