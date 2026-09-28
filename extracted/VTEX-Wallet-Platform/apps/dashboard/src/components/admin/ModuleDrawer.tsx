"use client"

import type { ReactNode } from "react"

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/Drawer"

interface ModuleDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  /** Petite étiquette au-dessus du titre (ex. « Fiche utilisateur »). */
  kicker?: string
  children: ReactNode
  footer?: ReactNode
}

/** Tiroir des modules — Leg Day : titre 28/800, étiquette 11/700 en capitales, sections en panneaux propres (pas de traits). */
export function ModuleDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  kicker,
  children,
  footer,
}: ModuleDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[560px]" aria-describedby={undefined}>
        <DrawerHeader>
          {kicker ? <p className="lg-kicker">{kicker}</p> : null}
          <DrawerTitle>{title}</DrawerTitle>
          {subtitle ? <p className="lg-sub">{subtitle}</p> : null}
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-6">{children}</DrawerBody>
        {footer ? (
          <div className="flex flex-wrap gap-2 pt-4 shadow-[0_-10px_24px_-16px_rgba(15,18,48,0.16)]">
            {footer}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

/** Regroupement visuel : étiquette + panneau de surface propre. */
export function DrawerSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <p className="lg-kicker lg-section-title">{title}</p>
      <div className="lg-panel">{children}</div>
    </section>
  )
}

export function DrawerRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#6b7396]">{label}</span>
      <span className="text-right font-semibold text-[#0a0d1e]">{value}</span>
    </div>
  )
}
