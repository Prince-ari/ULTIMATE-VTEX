"use client"

import * as React from "react"
import Link from "next/link"
import { format as formatMoney, isCurrencyCode } from "@vtex/money"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegConfirm, LegDrawer, LegPill, LegRow, LegSection, LegSocle, LegTabs } from "@/components/ui/legkit"
import { useToast } from "@/components/admin/Toast"
import { WalletManagersPanel } from "@/components/admin/managers/WalletManagersPanel"
import { TemporaryPasswordDialog } from "@/components/admin/users/TemporaryPasswordDialog"
import { formatDate, formatDateTime, STATUS_LABEL } from "@/lib/adminFormat"
import { NETWORK_LABEL } from "@/lib/cardFormat"
import { ROLE_LABEL, assignableRoles, canManageTarget, isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type UserFile = Outputs["admin"]["users"]["file"]
type CurrencyOption = Outputs["config"]["currencies"][number]
type Tab = "profil" | "wallet" | "securite" | "activite"

const TABS: { id: Tab; label: string }[] = [
  { id: "profil", label: "Profil" },
  { id: "wallet", label: "Wallets" },
  { id: "securite", label: "Sécurité" },
  { id: "activite", label: "Activité" },
]

const WALLET_TYPE_LABEL = { PERSONAL: "Personnel", PROFESSIONAL: "Professionnel" } as const
const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = { active: "ok", suspended: "warn", deleted: "neutral" }
const ACCOUNT_STATUS = { active: "Actif", frozen: "Gelé", closed: "Clôturé" } as const

function money(cents: number, currency: string) {
  return isCurrencyCode(currency) ? formatMoney(cents, currency) : `${cents} ${currency}`
}

type Confirmation = null | { kind: "suspend" | "reactivate" | "delete" | "reset" | "unlock" | "role"; role?: PlatformRole }

/**
 * Fiche centrale d'un utilisateur : tout ce qu'un administrateur fait couramment (voir le wallet, changer la devise d'affichage, ouvrir un
 * compte dans une autre devise, modifier le profil, réinitialiser l'accès…) se fait ici, sans changer de page.
 * Les boutons masqués reflètent les droits ; c'est le serveur qui décide.
 */
export function UserFileDrawer({ userId, me, onClose, onChanged }: { userId: number | null; me: { id: number; role: PlatformRole }; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [file, setFile] = React.useState<UserFile | null>(null)
  const [tab, setTab] = React.useState<Tab>("profil")
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([])
  const [displayCurrency, setDisplayCurrency] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<Confirmation>(null)
  const [reset, setReset] = React.useState<null | { password: string; expiresAt: string | Date }>(null)
  const [nextRole, setNextRole] = React.useState("")
  const [newCurrency, setNewCurrency] = React.useState("")
  const [displayChoice, setDisplayChoice] = React.useState("EUR")

  const load = React.useCallback(async (id: number) => {
    setLoadError(null)
    try {
      const [data, settings] = await Promise.all([
        api.admin.users.file.query({ userId: id }),
        api.walletSettings.adminGet.query({ userId: id }).catch(() => null),
      ])
      setFile(data)
      setDisplayCurrency(settings?.displayCurrency ?? null)
      setDisplayChoice(settings?.displayCurrency ?? "EUR")
    } catch (error) {
      setFile(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger la fiche.")
    }
  }, [])

  React.useEffect(() => {
    if (userId === null) return // la dernière fiche reste affichée le temps que le tiroir se referme
    setFile(null); setTab("profil"); setNextRole(""); setNewCurrency("")
    void load(userId)
  }, [userId, load])

  React.useEffect(() => {
    api.config.currencies.query().then(setCurrencies).catch(() => setCurrencies([]))
  }, [])

  const target = file ? { id: file.user.id, role: file.user.role as PlatformRole } : null
  const canManage = target ? canManageTarget(me, target) : false
  const canEditProfile = target ? isAdmin(me.role) && (canManage || me.id === target.id) : false
  const roleChoices = target ? assignableRoles(me, target) : []
  const ownedCurrencies = new Set(file?.personal.accounts.map((account) => account.currency) ?? [])
  const openableCurrencies = currencies.filter((currency) => !ownedCurrencies.has(currency.code))
  const displayCurrencies = currencies.filter((currency) => currency.eurRate !== null)

  async function run(action: () => Promise<void>, success: string) {
    if (!file) return
    try {
      await action()
      show(success)
      await Promise.all([load(file.user.id), Promise.resolve(onChanged())])
    } catch (error) {
      show(error instanceof Error ? error.message : "Action impossible.", "error")
    }
  }

  async function applyConfirmation(choice: NonNullable<Confirmation>) {
    if (!file) return
    const id = file.user.id
    if (choice.kind === "suspend") await run(() => api.users.suspend.mutate({ id }), "Compte suspendu : ses sessions sont coupées.")
    else if (choice.kind === "reactivate") await run(() => api.users.reactivate.mutate({ id }), "Compte réactivé.")
    else if (choice.kind === "delete") await run(() => api.users.delete.mutate({ id }), "Compte supprimé.")
    else if (choice.kind === "unlock") await run(() => api.users.unlock.mutate({ id }), "Compte déverrouillé.")
    else if (choice.kind === "role" && choice.role) await run(async () => { await api.users.update.mutate({ id, role: choice.role }) }, `Rôle mis à jour : ${ROLE_LABEL[choice.role]}. Les sessions ouvertes ont été coupées.`)
    else if (choice.kind === "reset") {
      try {
        const result = await api.users.resetPassword.mutate({ id })
        setReset({ password: result.temporaryPassword, expiresAt: result.expiresAt })
        await Promise.all([load(id), Promise.resolve(onChanged())])
      } catch (error) {
        show(error instanceof Error ? error.message : "Réinitialisation impossible.", "error")
      }
    }
  }

  const title = file ? `${file.user.firstName} ${file.user.lastName}` : loadError ? "Fiche indisponible" : "Chargement…"
  const locked = Boolean(file?.security.lockedUntil && new Date(file.security.lockedUntil).getTime() > Date.now())

  return (
    <>
      <LegDrawer open={userId !== null} onOpenChange={(open) => !open && onClose()} kicker="Fiche utilisateur" title={title} subtitle={file?.user.email}>
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!file && !loadError ? <p className="lg-sub" role="status">Chargement de la fiche…</p> : null}
        {file ? (
          <>
            <div className="lg-badges">
              <LegPill tone={STATUS_TONE[file.user.status] ?? "neutral"}>{STATUS_LABEL[file.user.status]}</LegPill>
              <LegPill tone="neutral">{ROLE_LABEL[file.user.role as PlatformRole]}</LegPill>
              {file.walletTypes.map((type) => <LegPill key={type} tone="navy">Wallet {WALLET_TYPE_LABEL[type].toLowerCase()}</LegPill>)}
              {file.security.mustChangePassword ? <LegPill tone="warn" icon="key">Mot de passe temporaire</LegPill> : null}
              {locked ? <LegPill tone="danger" icon="lock">Verrouillé</LegPill> : null}
            </div>

            <LegTabs tabs={TABS} value={tab} onChange={setTab} label="Sections de la fiche" idPrefix="user" />

            {tab === "profil" ? (
              <div role="tabpanel" id="user-panel-profil" aria-labelledby="user-tab-profil" className="lg-stack">
                <LegSection title="Identité">
                  <LegRow label="Identifiant" value={<span className="lg-mono">#{file.user.id}</span>} />
                  <LegRow label="Téléphone" value={file.user.phone ?? "—"} />
                  <LegRow label="KYC" value={file.user.kycVerified ? "Vérifié" : "En attente"} />
                  <LegRow label="Créé le" value={formatDate(file.user.createdAt)} />
                  <LegRow label="Dernière activité" value={file.security.lastActiveAt ? formatDateTime(file.security.lastActiveAt) : "Jamais"} />
                </LegSection>
                {canEditProfile ? <LegSection title="Modifier le profil"><ProfileEditor user={file.user} onSave={(patch) => void run(async () => { await api.users.update.mutate({ id: file.user.id, ...patch }) }, "Profil mis à jour.")} /></LegSection> : null}
                {roleChoices.length > 0 ? (
                  <LegSection title="Rôle">
                    <div className="lg-inline-form">
                      <div>
                        <label className="lg-label" htmlFor="uf-role">Nouveau rôle</label>
                        <select id="uf-role" className="lg-input" value={nextRole} onChange={(event) => setNextRole(event.target.value)}>
                          <option value="">Choisir…</option>
                          {roleChoices.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                        </select>
                      </div>
                      <LegButton variant="secondary" disabled={!nextRole} onClick={() => setConfirm({ kind: "role", role: nextRole as PlatformRole })}>Appliquer</LegButton>
                    </div>
                    <p className="lg-hint">Le changement de rôle coupe immédiatement les sessions ouvertes de la personne.</p>
                  </LegSection>
                ) : null}
              </div>
            ) : null}

            {tab === "wallet" ? (
              <div role="tabpanel" id="user-panel-wallet" aria-labelledby="user-tab-wallet" className="lg-stack">
                <section>
                  <p className="lg-kicker lg-section-title">Wallet personnel</p>
                  <div className="lg-stack">
                    {file.personal.accounts.length === 0 ? <p className="lg-hint">Aucun wallet personnel. Il s’ouvre ci-dessous, ou automatiquement à la première utilisation par le titulaire.</p> : null}
                    {file.personal.accounts.map((account) => (
                      <div key={account.id} className="lg-account" data-testid={`personal-account-${account.currency}`}>
                        <div className="lg-account-head">
                          <LegSocle icon="wallet" tone="violet" size="md" />
                          <span><strong>Compte {account.currency}</strong><small>#{account.id}</small></span>
                          <LegPill tone={account.status === "active" ? "ok" : "warn"}>{ACCOUNT_STATUS[account.status]}</LegPill>
                        </div>
                        <LegRow label="Solde disponible" value={money(account.availableBalanceCents, account.currency)} />
                        <LegRow label="Réservé" value={money(account.reservedBalanceCents, account.currency)} />
                        <BankMiniList items={account.banking} legacyMasked={account.ibanMasked} />
                        {account.cards.map((card) => (
                          <Link key={card.id} href={`/cartes?card=PERSONAL-${card.id}`} className="lg-mini-card" aria-label={`Ouvrir la carte ${card.label} se terminant par ${card.lastFour}`}>
                            <span className="cards-swatch" aria-hidden="true" />
                            <span><b>{card.label}</b><small className="lg-mono">•••• {card.lastFour} · {NETWORK_LABEL[card.network]}</small></span>
                            {card.vault.hasPan ? <LegPill tone="ok" icon="lock">Coffre</LegPill> : <LegPill tone="warn" icon="pencil">À saisir</LegPill>}
                            <LegIcon name="chevron" className="cards-row-chevron" />
                          </Link>
                        ))}
                      </div>
                    ))}
                    {isAdmin(me.role) && openableCurrencies.length > 0 ? (
                      <div className="lg-inline-form">
                        <div>
                          <label className="lg-label" htmlFor="uf-new-currency">{file.personal.accounts.length ? "Ouvrir un compte dans une autre devise" : "Ouvrir le wallet personnel"}</label>
                          <select id="uf-new-currency" className="lg-input" value={newCurrency} onChange={(event) => setNewCurrency(event.target.value)}>
                            <option value="">Choisir une devise…</option>
                            {openableCurrencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.symbol} {currency.name} ({currency.code})</option>)}
                          </select>
                        </div>
                        <LegButton variant="secondary" disabled={!newCurrency} onClick={() => void run(async () => { await api.walletAdmin.createWallet.mutate({ userId: file.user.id, currency: newCurrency as "EUR" | "USD" | "XPF" }); setNewCurrency("") }, `Compte ${newCurrency} ouvert.`)}>Ouvrir</LegButton>
                      </div>
                    ) : null}
                    {file.personal.accounts.length > 0 ? <WalletManagersPanel walletType="PERSONAL" holderId={file.user.id} canManage={isAdmin(me.role)} holderName={title} /> : null}
                    {file.personal.accounts.length > 0 ? <p className="lg-hint">La devise d’un compte existant ne change pas (le grand livre est dans cette devise) : on ouvre un compte dans une autre devise. Le wallet du titulaire affiche le compte de sa devise initiale (le plus ancien).</p> : null}
                  </div>
                </section>

                {isAdmin(me.role) ? (
                  <LegSection title="Devise d’affichage du wallet">
                    <div className="lg-inline-form">
                      <div>
                        <label className="lg-label" htmlFor="uf-display-currency">Affichage (convertit à la parité fixe)</label>
                        <select id="uf-display-currency" className="lg-input" value={displayChoice} onChange={(event) => setDisplayChoice(event.target.value)}>
                          {displayCurrencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.symbol} {currency.name}</option>)}
                        </select>
                      </div>
                      <LegButton variant="secondary" disabled={displayChoice === (displayCurrency ?? "EUR")} onClick={() => void run(async () => { await api.walletSettings.adminUpdate.mutate({ userId: file.user.id, displayCurrency: displayChoice as "EUR" | "USD" | "XPF" }) }, "Devise d’affichage enregistrée : le wallet la relira à sa prochaine ouverture.")}>Enregistrer</LegButton>
                    </div>
                  </LegSection>
                ) : null}

                <section>
                  <p className="lg-kicker lg-section-title">Sociétés (Wallet Pro)</p>
                  <div className="lg-stack">
                    {file.companies.length === 0 ? <p className="lg-hint">Aucune société.</p> : null}
                    {file.companies.map((company) => (
                      <div key={company.businessId} className="lg-account" data-testid={`company-${company.businessId}`}>
                        <div className="lg-account-head">
                          <LegSocle icon="building" tone="teal" size="md" />
                          <span><strong>{company.brandName}</strong><small>{company.legalName}</small></span>
                          <LegPill tone="neutral">{company.myRole}</LegPill>
                        </div>
                        <WalletManagersPanel walletType="PROFESSIONAL" holderId={company.businessId} canManage={isAdmin(me.role)} holderName={company.brandName} />
                        {company.accounts.map((account) => (
                          <div key={account.id} className="lg-stack">
                            <LegRow label={account.label} value={money(account.availableBalanceCents, account.currency)} />
                            <BankMiniList items={account.banking} legacyMasked={account.ibanMasked} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "securite" ? (
              <div role="tabpanel" id="user-panel-securite" aria-labelledby="user-tab-securite" className="lg-stack">
                <LegSection title="Accès">
                  <LegRow label="Sessions actives" value={file.security.activeSessions} />
                  <LegRow label="Dernière connexion" value={file.security.lastSignInAt ? formatDateTime(file.security.lastSignInAt) : "—"} />
                  <LegRow label="Échecs de connexion" value={file.security.failedLoginCount} />
                  <LegRow label="Dernier changement de mot de passe" value={file.security.passwordChangedAt ? formatDateTime(file.security.passwordChangedAt) : "—"} />
                  {file.security.mustChangePassword && file.security.tempPasswordExpiresAt ? <LegRow label="Mot de passe temporaire jusqu’au" value={formatDateTime(file.security.tempPasswordExpiresAt)} /> : null}
                </LegSection>
                <p className="lg-hint">Les mots de passe existants ne sont jamais affichés (ils ne sont conservés que sous forme d’empreinte). Une réinitialisation génère un mot de passe temporaire à durée limitée.</p>
                {canManage ? (
                  <section>
                    <p className="lg-kicker lg-section-title">Actions</p>
                    <div className="lg-actions">
                      <LegButton variant="secondary" icon="key" onClick={() => setConfirm({ kind: "reset" })}>Réinitialiser le mot de passe</LegButton>
                      {file.security.failedLoginCount > 0 || locked ? <LegButton variant="secondary" icon="unlock" onClick={() => setConfirm({ kind: "unlock" })}>Déverrouiller</LegButton> : null}
                      {file.user.status === "active" ? <LegButton variant="secondary" icon="lock" onClick={() => setConfirm({ kind: "suspend" })}>Suspendre</LegButton> : file.user.status === "suspended" ? <LegButton variant="secondary" icon="check" onClick={() => setConfirm({ kind: "reactivate" })}>Réactiver</LegButton> : null}
                      {file.user.status !== "deleted" ? <LegButton variant="danger" icon="trash" onClick={() => setConfirm({ kind: "delete" })}>Supprimer</LegButton> : null}
                    </div>
                  </section>
                ) : <p className="lg-hint">Vos droits ne permettent pas d’agir sur ce compte.</p>}
              </div>
            ) : null}

            {tab === "activite" ? (
              <div role="tabpanel" id="user-panel-activite" aria-labelledby="user-tab-activite" className="lg-stack">
                {file.activity === null ? <p className="lg-hint">L’historique d’audit est réservé aux administrateurs.</p> : file.activity.length === 0 ? <p className="lg-hint">Aucun événement.</p> : (
                  <div className="lg-panel" role="list" aria-label="Événements récents">
                    {file.activity.map((entry) => (
                      <div key={entry.id} className="lg-event" role="listitem">
                        <div className="lg-event-head"><code>{entry.action}</code><time>{formatDateTime(entry.createdAt)}</time></div>
                        <small>{entry.actorId ? `par #${entry.actorId}${entry.actorRole ? ` (${ROLE_LABEL[entry.actorRole as PlatformRole] ?? entry.actorRole})` : ""}` : "système"}{entry.ip ? ` · ${entry.ip}` : ""}{entry.supportSessionId ? " · session support" : ""}</small>
                      </div>
                    ))}
                  </div>
                )}
                <p className="lg-hint">Chaque consultation de cette fiche est elle-même journalisée.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </LegDrawer>

      {confirm && file ? <LegConfirm
        open
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={confirm.kind === "suspend" ? "Suspendre ce compte ?" : confirm.kind === "reactivate" ? "Réactiver ce compte ?" : confirm.kind === "delete" ? "Supprimer ce compte ?" : confirm.kind === "unlock" ? "Déverrouiller ce compte ?" : confirm.kind === "role" ? "Changer le rôle ?" : "Réinitialiser le mot de passe ?"}
        description={
          confirm.kind === "delete" ? `${file.user.firstName} ${file.user.lastName} perdra l’accès immédiatement. Cette action est irréversible.`
          : confirm.kind === "reset" ? `Un mot de passe temporaire sera généré et affiché une seule fois. Les sessions de ${file.user.firstName} ${file.user.lastName} seront coupées et le compte déverrouillé.`
          : confirm.kind === "role" && confirm.role ? `${file.user.firstName} ${file.user.lastName} deviendra « ${ROLE_LABEL[confirm.role]} » ; ses sessions ouvertes seront coupées. L’action est journalisée.`
          : `${file.user.firstName} ${file.user.lastName} — le changement est journalisé.`
        }
        confirmLabel={confirm.kind === "delete" ? "Supprimer" : confirm.kind === "reset" ? "Générer un mot de passe" : "Confirmer"}
        destructive={confirm.kind === "delete"}
        onConfirm={() => { const choice = confirm; setConfirm(null); void applyConfirmation(choice) }}
      /> : null}

      {reset && file ? <TemporaryPasswordDialog open title="Mot de passe temporaire" email={file.user.email} password={reset.password} expiresAt={reset.expiresAt} onClose={() => setReset(null)} /> : null}
    </>
  )
}

/** RIB d'un compte (masqués) : chacun ouvre sa fiche dans « Banque ». */
function BankMiniList({ items, legacyMasked }: { items: { id: number; kind: "MAIN" | "SUB"; label: string; ibanMasked: string; currency: string; status: "active" | "disabled" }[]; legacyMasked: string | null }) {
  if (items.length === 0) return <LegRow label="RIB" value={<span className="lg-mono">{legacyMasked ?? "Aucun"}</span>} />
  return (
    <>
      {items.map((item) => (
        <Link key={item.id} href={`/banque?rib=${item.id}`} className="lg-mini-card" aria-label={`Ouvrir le RIB ${item.label}`}>
          <LegSocle icon={item.kind === "MAIN" ? "bank" : "hash"} tone={item.kind === "MAIN" ? "navy" : "violet"} size="sm" />
          <span><b>{item.label}</b><small className="lg-mono">{item.ibanMasked}</small></span>
          <LegPill tone={item.status === "active" ? "ok" : "danger"}>{item.kind === "MAIN" ? "Principal" : "Sous-RIB"}</LegPill>
          <LegIcon name="chevron" className="cards-row-chevron" />
        </Link>
      ))}
    </>
  )
}

type ProfilePatch = { firstName?: string; lastName?: string; email?: string; phone?: string }

function ProfileEditor({ user, onSave }: { user: { firstName: string; lastName: string; email: string; phone: string | null }; onSave: (patch: ProfilePatch) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [firstName, setFirstName] = React.useState(user.firstName)
  const [lastName, setLastName] = React.useState(user.lastName)
  const [email, setEmail] = React.useState(user.email)
  const [phone, setPhone] = React.useState(user.phone ?? "")

  if (!editing) return <LegButton variant="secondary" icon="pencil" onClick={() => setEditing(true)}>Modifier prénom, nom, e-mail, téléphone</LegButton>
  return <div className="lg-stack">
    <div><label className="lg-label" htmlFor="edit-firstName">Prénom</label><input id="edit-firstName" className="lg-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} /></div>
    <div><label className="lg-label" htmlFor="edit-lastName">Nom</label><input id="edit-lastName" className="lg-input" value={lastName} onChange={(event) => setLastName(event.target.value)} /></div>
    <div><label className="lg-label" htmlFor="edit-email">E-mail</label><input id="edit-email" className="lg-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
    <div><label className="lg-label" htmlFor="edit-phone">Téléphone</label><input id="edit-phone" className="lg-input" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
    <div className="lg-actions">
      <LegButton onClick={() => { onSave({ firstName, lastName, email, phone: phone || undefined }); setEditing(false) }}>Enregistrer</LegButton>
      <LegButton variant="ghost" onClick={() => setEditing(false)}>Annuler</LegButton>
    </div>
  </div>
}
