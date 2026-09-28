import { db, users, type Db, type WalletType } from "@vtex/core"
import { businessMembers, businessWalletAccounts, businesses } from "@vtex/business"
import { walletAccounts } from "@vtex/wallet"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"

import { likeContains } from "./sqlLike"

/**
 * Titulaires de wallets, vus de l'administration : `(wallet_type, holder_id)` = utilisateur (PERSONAL) ou entreprise (PROFESSIONAL).
 * Aucune permission ici : les routeurs appelants les vérifient avant d'appeler ces fonctions.
 */

export interface HolderRef { walletType: WalletType; holderId: number }

export interface HolderInfo extends HolderRef {
  name: string
  subtitle: string | null
  status: string
  currencies: string[]
}

export const holderKey = (ref: HolderRef) => `${ref.walletType}:${ref.holderId}`

const fullName = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`.trim()

/** Charge plusieurs titulaires en peu de requêtes (une par domaine) ; un titulaire inexistant est simplement absent du résultat. */
export async function loadHolders(executor: Db, refs: HolderRef[]): Promise<Map<string, HolderInfo>> {
  const result = new Map<string, HolderInfo>()
  const personalIds = [...new Set(refs.filter((ref) => ref.walletType === "PERSONAL").map((ref) => ref.holderId))]
  const businessIds = [...new Set(refs.filter((ref) => ref.walletType === "PROFESSIONAL").map((ref) => ref.holderId))]

  if (personalIds.length > 0) {
    const [people, accounts] = await Promise.all([
      executor.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, status: users.status }).from(users).where(inArray(users.id, personalIds)),
      executor.select({ userId: walletAccounts.userId, currency: walletAccounts.currency }).from(walletAccounts).where(inArray(walletAccounts.userId, personalIds)),
    ])
    for (const person of people) {
      const currencies = accounts.filter((account) => account.userId === person.id).map((account) => account.currency)
      // Un utilisateur sans wallet n'est pas un titulaire de wallet personnel.
      if (currencies.length === 0) continue
      result.set(holderKey({ walletType: "PERSONAL", holderId: person.id }), { walletType: "PERSONAL", holderId: person.id, name: fullName(person), subtitle: person.email, status: person.status, currencies })
    }
  }
  if (businessIds.length > 0) {
    const [companies, accounts] = await Promise.all([
      executor.select({ id: businesses.id, brandName: businesses.brandName, legalName: businesses.legalName, status: businesses.status }).from(businesses).where(inArray(businesses.id, businessIds)),
      executor.select({ businessId: businessWalletAccounts.businessId, currency: businessWalletAccounts.currency }).from(businessWalletAccounts).where(inArray(businessWalletAccounts.businessId, businessIds)),
    ])
    for (const company of companies) {
      result.set(holderKey({ walletType: "PROFESSIONAL", holderId: company.id }), {
        walletType: "PROFESSIONAL", holderId: company.id, name: company.brandName, subtitle: company.legalName, status: company.status,
        currencies: accounts.filter((account) => account.businessId === company.id).map((account) => account.currency),
      })
    }
  }
  return result
}

/** Recherche de titulaires (personnes ayant un wallet, entreprises) pour les sélecteurs de l'administration. */
export async function searchHolders(query: string, limit = 30): Promise<HolderInfo[]> {
  // Chaque mot de la saisie doit se retrouver dans au moins un champ : « Cliente Dupont » trouve prénom + nom.
  const tokens = query.trim().split(/\s+/).filter(Boolean).map(likeContains)
  const [people, companies] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .innerJoin(walletAccounts, eq(walletAccounts.userId, users.id))
      .where(tokens.length ? and(...tokens.map((term) => or(like(users.email, term), like(users.firstName, term), like(users.lastName, term)))) : undefined)
      .groupBy(users.id)
      .orderBy(desc(users.id))
      .limit(limit),
    db.select({ id: businesses.id }).from(businesses).where(tokens.length ? and(...tokens.map((term) => or(like(businesses.brandName, term), like(businesses.legalName, term)))) : undefined).orderBy(desc(businesses.id)).limit(limit),
  ])
  const refs: HolderRef[] = [...people.map((person) => ({ walletType: "PERSONAL" as const, holderId: person.id })), ...companies.map((company) => ({ walletType: "PROFESSIONAL" as const, holderId: company.id }))]
  const loaded = await loadHolders(db, refs)
  return refs.map((ref) => loaded.get(holderKey(ref))).filter((info): info is HolderInfo => Boolean(info)).slice(0, limit)
}

export interface Recipient { userId: number; name: string }

/**
 * Destinataires d'un message à propos d'un wallet : le titulaire (wallet personnel) ou les propriétaires et administrateurs actifs de l'entreprise.
 * Un compte suspendu ne reçoit rien.
 */
export async function recipientsOf(executor: Db, ref: HolderRef): Promise<Recipient[]> {
  if (ref.walletType === "PERSONAL") {
    const [person] = await executor.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, status: users.status }).from(users).where(eq(users.id, ref.holderId)).limit(1)
    return person && person.status === "active" ? [{ userId: person.id, name: fullName(person) }] : []
  }
  const rows = await executor
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, ref.holderId), eq(businessMembers.status, "active"), inArray(businessMembers.role, ["owner", "admin"]), eq(users.status, "active")))
  return rows.map((row) => ({ userId: row.id, name: fullName(row) }))
}
