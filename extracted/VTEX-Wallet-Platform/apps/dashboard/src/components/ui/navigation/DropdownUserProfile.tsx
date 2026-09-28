"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/Dropdown"
import * as React from "react"

export type DropdownUserProfileProps = {
  children: React.ReactNode
  align?: "center" | "start" | "end"
  /** Identité réelle de la session (jamais de valeur factice). */
  name?: string
  email?: string
  roleLabel?: string
}

/** Fin de session : le serveur révoque le jeton et efface le cookie, puis retour à la connexion. */
async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } finally {
    window.location.assign("/login")
  }
}

export function DropdownUserProfile({ children, align = "start", name, email, roleLabel }: DropdownUserProfileProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>
          <span className="block text-sm font-extrabold tracking-[-0.01em] text-[#0a0d1e]">{name ?? "Session"}</span>
          {email ? <span className="block text-xs font-medium text-[#6b7396]">{email}</span> : null}
          {roleLabel ? <span className="lg-pill lg-pill--neutral mt-2">{roleLabel}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void signOut()}>Se déconnecter</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
