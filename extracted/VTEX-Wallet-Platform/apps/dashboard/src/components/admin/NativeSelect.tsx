import * as React from "react"

import { cx } from "@/lib/utils"

/**
 * Liste déroulante native : accessible, testable et sans dépendance, alignée sur le style des champs `Input`.
 * (Le composant Radix `Select` reste disponible pour les cas qui exigent un rendu personnalisé.)
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cx(
        // Même surface que `Input` (Leg Day) : rayon 14, aucun trait, chevron dessiné en SVG inline.
        "lg-select block w-full appearance-none rounded-[14px] border-0 bg-[#f0f2fb] px-4 py-[11px] pr-10 font-medium text-[#0a0d1e] outline-none transition sm:text-sm",
        "hover:bg-[#ebeefa] focus:bg-white focus:shadow-[inset_0_0_0_2px_#8ea9ff,0_6px_16px_-8px_rgba(90,107,216,0.5)]",
        "disabled:cursor-not-allowed disabled:bg-[#eef0f8] disabled:text-[#9da5be]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})
