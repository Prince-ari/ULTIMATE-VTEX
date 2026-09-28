import Link from "next/link"
import { PageHeader } from "@/components/shell/PageHeader"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import type { IconName } from "@/lib/nav"

interface ModuleStubProps {
  kicker: string
  title: string
  description: string
  icon: IconName
  phase: string
  outline: string[]
}

/** Squelette navigable pour un module encore non maquetté : donne l'intention,
 *  la phase de livraison et une esquisse structurée. Aucune donnée simulée. */
export function ModuleStub({ kicker, title, description, icon, phase, outline }: ModuleStubProps) {
  return (
    <>
      <PageHeader kicker={kicker} title={title} description={description} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone="gold">Phase {phase}</Badge>
        <Badge tone="neutral">Module en construction</Badge>
        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--c-t2)] hover:text-[var(--c-t1)]"
        >
          <Icon name="home" size={12} /> Retour Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tint-primary)] text-[var(--c-signature)]">
              <Icon name={icon} size={22} />
            </span>
            <div>
              <CardTitle>Ce qu&apos;on livre dans ce module</CardTitle>
              <CardSubtitle>
                Extrait du brief PRO — chaque item devient un écran ou un composant.
              </CardSubtitle>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {outline.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] text-[var(--c-t2)]">
                <Icon name="dot" size={10} className="mt-[6px] text-[var(--c-signature)]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="mt-6 rounded-[20px] border border-dashed border-white/10 bg-[var(--c-s1)]/40 px-6 py-6 text-center">
        <p className="text-[13px] leading-[1.6] text-[var(--c-t2)]">
          Ce module n&apos;est pas encore branché sur des données. Il sera livré{" "}
          <span className="font-bold text-[var(--c-t1)]">en Phase {phase}</span>. La structure
          (routes, sidebar, tokens, composants réutilisables) est en place — il ne reste que la
          composition des écrans et le branchement aux données.
        </p>
      </div>
    </>
  )
}
