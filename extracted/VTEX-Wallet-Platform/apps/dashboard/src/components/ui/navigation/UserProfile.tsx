"use client"

import * as React from "react"

import { Button } from "@/components/Button"
import { ROLE_LABEL, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"
import { cx, focusRing } from "@/lib/utils"

import { DashboardIcon } from "./DashboardIcon"
import { DropdownUserProfile } from "./DropdownUserProfile"

type SessionProfile = {
  firstName: string | null
  lastName: string | null
  email: string
  avatarUrl: string | null
  role: string
}

function profileIdentity(profile: SessionProfile | null) {
  if (!profile) return { initials: "—", label: "Chargement…", email: undefined, roleLabel: undefined, avatarUrl: null }
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
  return {
    initials: initials || profile.email.slice(0, 2).toUpperCase(),
    label: name || profile.email,
    email: profile.email,
    roleLabel: ROLE_LABEL[profile.role as PlatformRole] ?? profile.role,
    avatarUrl: profile.avatarUrl,
  }
}

function useSessionProfile() {
  const [profile, setProfile] = React.useState<SessionProfile | null>(null)

  React.useEffect(() => {
    let cancelled = false
    api.users.getMe.query().then((result) => {
      if (!cancelled) setProfile(result)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  return profileIdentity(profile)
}

/** Avatar : socle plein (initiales) — jamais de trait autour. */
function Avatar({ identity, size }: { identity: ReturnType<typeof profileIdentity>; size: "sm" | "md" }) {
  return (
    <span className={cx("lg-socle text-[11px] font-extrabold tracking-[0.02em]", size === "sm" ? "lg-socle--sm" : "lg-socle--md", "lg-socle--violet")} aria-hidden="true">
      {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : identity.initials}
    </span>
  )
}

export const UserProfileDesktop = () => {
  const identity = useSessionProfile()
  return (
    <DropdownUserProfile name={identity.label} email={identity.email} roleLabel={identity.roleLabel}>
      <Button
        aria-label="Menu du compte"
        variant="ghost"
        className={cx(
          focusRing,
          "group flex w-full items-center justify-between rounded-[20px] p-2 text-sm font-semibold text-[#dfe5ff] hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar identity={identity} size="sm" />
          <span className="truncate">{identity.label}</span>
        </span>
        <DashboardIcon name="more" className="size-4 shrink-0 text-[#9aa5d8] group-hover:text-white" aria-hidden="true" />
      </Button>
    </DropdownUserProfile>
  )
}

export const UserProfileMobile = () => {
  const identity = useSessionProfile()
  return (
    <DropdownUserProfile align="end" name={identity.label} email={identity.email} roleLabel={identity.roleLabel}>
      <Button
        aria-label="Menu du compte"
        variant="ghost"
        className="group flex items-center rounded-full p-1 text-sm font-medium hover:bg-[#f0f2fb] data-[state=open]:bg-[#f0f2fb]"
      >
        <Avatar identity={identity} size="sm" />
      </Button>
    </DropdownUserProfile>
  )
}
