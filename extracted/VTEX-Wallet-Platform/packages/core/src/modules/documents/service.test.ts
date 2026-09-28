import { describe, expect, it, vi } from "vitest"

vi.mock("../media/objectStorage", () => ({
  assertPrivateObject: vi.fn().mockResolvedValue(undefined),
}))

import { db } from "../../db/client"
import { makeUser } from "../../test/fixtures"
import { NotFoundError } from "../../auth/permissions"
import { listMyNotifications } from "../notifications/service"
import { subscribeRealtime } from "../realtime/events"
import { assignPdf, getForDownload, listMine, submitTransferProof } from "./service"

describe("documents.submitTransferProof", () => {
  it("enregistre le justificatif, sa référence et une notification persistante pour chaque superviseur", async () => {
    const holder = await makeUser()
    const admin = await makeUser({ role: "admin" })
    const agent = await makeUser({ role: "agent" })
    const realtimeEvents: string[] = []
    const unsubscribe = subscribeRealtime((event) => realtimeEvents.push(event.type))

    await submitTransferProof(db, holder.actor, {
      title: "Virement de régularisation",
      fileName: "preuve-virement.pdf",
      mimeType: "application/pdf",
      storageKey: `media/users/${holder.userId}/transfer-proof/proof.pdf`,
      sizeBytes: 2048,
      transactionReference: "VTX-2026-0001",
    })
    unsubscribe()

    const documents = await listMine(db, holder.actor)
    expect(documents.some((document) => document.transactionReference === "VTX-2026-0001")).toBe(true)

    const [adminNotifications, agentNotifications] = await Promise.all([
      listMyNotifications(db, admin.actor),
      listMyNotifications(db, agent.actor),
    ])
    expect(adminNotifications.some((notification) => notification.title === "Justificatif de virement reçu")).toBe(true)
    expect(agentNotifications.some((notification) => notification.title === "Justificatif de virement reçu")).toBe(true)
    expect(realtimeEvents).toContain("transfer_proof.submitted")
    expect(realtimeEvents.filter((type) => type === "notification.created").length).toBeGreaterThanOrEqual(2)
  })

  it("attribue un PDF privé et interdit sa résolution à un autre titulaire", async () => {
    const admin = await makeUser({ role: "admin" })
    const holder = await makeUser()
    const otherHolder = await makeUser()
    const documentId = await assignPdf(db, admin.actor, {
      userId: holder.userId,
      title: "Attestation de compte",
      fileName: "attestation.pdf",
      storageKey: `media/admin/${admin.userId}/documents/attestation.pdf`,
      sizeBytes: 1024,
    })

    await expect(getForDownload(db, holder.actor, Number(documentId))).resolves.toMatchObject({ id: Number(documentId), fileName: "attestation.pdf", storageKey: `media/admin/${admin.userId}/documents/attestation.pdf` })
    await expect(getForDownload(db, otherHolder.actor, Number(documentId))).rejects.toThrow(NotFoundError)
  })
})
