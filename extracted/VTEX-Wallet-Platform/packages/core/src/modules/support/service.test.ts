import { describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { makeUser } from "../../test/fixtures"
import { createTicket, listMyTickets, replyToTicket, updateTicketStatus } from "./service"
import { ForbiddenError } from "../../auth/permissions"

describe("support", () => {
  it("crée un ticket avec le premier message, visible dans listMyTickets", async () => {
    const u = await makeUser()
    await createTicket(db, u.actor, "Sujet test", "Premier message")
    const mine = await listMyTickets(db, u.actor)
    expect(mine.some((t) => t.subject === "Sujet test")).toBe(true)
  })

  it("un utilisateur ne peut PAS répondre au ticket d'un autre utilisateur", async () => {
    const owner = await makeUser()
    const attacker = await makeUser()
    const ticketId = await createTicket(db, owner.actor, "Privé", "Message privé")
    await expect(replyToTicket(db, attacker.actor, ticketId, "Intrusion")).rejects.toThrow(ForbiddenError)
  })

  it("l'agent peut répondre et changer le statut de n'importe quel ticket", async () => {
    const owner = await makeUser()
    const agent = await makeUser({ role: "agent" })
    const ticketId = await createTicket(db, owner.actor, "Besoin d'aide", "Détail du souci")
    await expect(replyToTicket(db, agent.actor, ticketId, "On regarde ça")).resolves.not.toThrow()
    await expect(updateTicketStatus(db, agent.actor, ticketId, "in_progress")).resolves.not.toThrow()
  })
})
