import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { cx, focusRing } from "@/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DashboardIcon } from "./DashboardIcon"
import { navVisible } from "@/lib/roles"
import { useSession } from "@/lib/session"
import { navigation, secondaryNavigation } from "./sidebar"

// Réutilise exactement la même liste de modules que la sidebar desktop
// (import depuis sidebar.tsx) — une seule source de vérité pour la nav.

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

/** Le maelström chromatique cycle sur les familles de teintes, une par ligne cliquable (RULE 008). */
const TONES = ["violet", "green", "teal", "amber", "brick"] as const

export default function MobileSidebar() {
  const pathname = usePathname()
  const role = useSession()?.role ?? null
  const allItems = [...navigation, ...(role === "account_manager" ? [] : secondaryNavigation)].filter((item) => navVisible(role, item.href))

  return (
    <>
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Ouvrir la navigation"
            className="group flex items-center rounded-full p-2.5 text-sm font-medium text-[#0a0d1e] hover:bg-[#f0f2fb] data-[state=open]:bg-[#f0f2fb]"
          >
            <DashboardIcon name="menu"
              className="size-6 shrink-0 sm:size-5"
              aria-hidden="true"
            />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="sm:max-w-md" aria-describedby={undefined}>
          <DrawerHeader>
            <p className="lg-kicker">Navigation</p>
            <DrawerTitle>Dashboard</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <nav aria-label="Navigation principale" className="lg-nav">
              {allItems.map((item, index) => (
                <DrawerClose asChild key={item.name}>
                  <Link
                    href={item.href}
                    aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                    className={cx(focusRing)}
                  >
                    <span className={cx("lg-socle lg-socle--sm", `lg-socle--${TONES[index % TONES.length]}`)}>
                      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                    </span>
                    {item.name}
                  </Link>
                </DrawerClose>
              ))}
            </nav>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  )
}
