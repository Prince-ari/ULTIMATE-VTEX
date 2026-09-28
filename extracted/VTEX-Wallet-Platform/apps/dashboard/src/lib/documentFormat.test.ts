import { describe, expect, it } from "vitest"

import { CATEGORY_LABEL, MAX_UPLOAD_BYTES, SEND_CATEGORIES, checkUpload, documentState, downloadUrl, formatSize, historyEntry, socleFor, titleFromFileName, wallets } from "./documentFormat"

const row = (overrides: Partial<Parameters<typeof documentState>[0]> = {}) => ({ status: "active" as const, reviewStatus: "none" as const, firstViewedAt: null, ...overrides })

describe("documentState", () => {
  it("un document envoyé est « Envoyé » puis « Consulté » dès la première ouverture", () => {
    expect(documentState(row())).toMatchObject({ key: "sent", label: "Envoyé", socle: "violet" })
    expect(documentState(row({ firstViewedAt: new Date() }))).toMatchObject({ key: "viewed", label: "Consulté", pill: "ok", socle: "green" })
    expect(documentState(row({ firstViewedAt: "2026-09-01T10:00:00Z" })).key).toBe("viewed")
  })

  it("une pièce remise par un titulaire suit son examen : à examiner, validée, refusée", () => {
    expect(documentState(row({ reviewStatus: "pending" }))).toMatchObject({ key: "pending", label: "À examiner", pill: "warn", socle: "amber" })
    expect(documentState(row({ reviewStatus: "validated" }))).toMatchObject({ key: "validated", pill: "ok" })
    expect(documentState(row({ reviewStatus: "rejected" }))).toMatchObject({ key: "rejected", pill: "danger", socle: "red" })
  })

  it("archivé ou retiré l'emporte sur tout autre état", () => {
    expect(documentState(row({ status: "archived", reviewStatus: "pending", firstViewedAt: new Date() }))).toMatchObject({ key: "archived", socle: "platinum" })
    expect(documentState(row({ status: "revoked", reviewStatus: "validated" }))).toMatchObject({ key: "revoked", pill: "danger" })
  })
})

describe("checkUpload / formatSize", () => {
  const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({ name: "releve.pdf", type: "application/pdf", size: 1024, ...over })

  it("accepte PDF, JPEG, PNG et WebP dans la limite de 8 Mo", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) expect(checkUpload(file({ type }))).toBeNull()
    expect(checkUpload(file({ size: MAX_UPLOAD_BYTES }))).toBeNull()
  })

  it("refuse un autre format, un fichier vide ou trop lourd, avec un message clair", () => {
    expect(checkUpload(file({ type: "text/html", name: "page.html" }))).toMatch(/Format refusé/)
    expect(checkUpload(file({ type: "application/x-msdownload", name: "prog.pdf" }))).toMatch(/Format refusé/)
    expect(checkUpload(file({ size: 0 }))).toMatch(/vide/)
    expect(checkUpload(file({ size: MAX_UPLOAD_BYTES + 1 }))).toMatch(/trop volumineux.*8 Mo/)
  })

  it("formate les tailles en unités françaises", () => {
    expect(formatSize(12)).toBe("12 o")
    expect(formatSize(340 * 1024)).toBe("340 Ko")
    expect(formatSize(1_300_000)).toBe("1,2 Mo")
    expect(formatSize(null)).toBe("—")
  })
})

describe("aides d'affichage", () => {
  it("propose un titre lisible à partir du nom de fichier", () => {
    expect(titleFromFileName("releve_compte-septembre.pdf")).toBe("Releve compte septembre")
    expect(titleFromFileName("C:\\Users\\moi\\Contrat  cadre.PDF")).toBe("Contrat cadre")
    expect(titleFromFileName(".pdf")).toBe("")
    expect(titleFromFileName("")).toBe("")
  })

  it("n'envoie jamais de justificatif de virement ; toutes les catégories ont un libellé", () => {
    expect(SEND_CATEGORIES).not.toContain("transfer_proof")
    for (const category of SEND_CATEGORIES) expect(CATEGORY_LABEL[category]).toBeTruthy()
    expect(CATEGORY_LABEL.transfer_proof).toBe("Justificatif de virement")
  })

  it("l'historique nomme chaque action connue et n'efface jamais une action inconnue", () => {
    expect(historyEntry("document.reject")).toMatchObject({ label: "Refusé", socle: "red" })
    expect(historyEntry("document.download")).toMatchObject({ label: "Téléchargé", icon: "download" })
    expect(historyEntry("document.mystere")).toEqual({ label: "document.mystere", icon: "history", socle: "platinum" })
  })

  it("adresse de téléchargement, pluriel des wallets, cycle de socles", () => {
    expect(downloadUrl(42)).toBe("/api/media/documents/42")
    expect(wallets(1)).toBe("1 wallet")
    expect(wallets(3)).toBe("3 wallets")
    expect(socleFor(0)).toBe("violet")
    expect(socleFor(5)).toBe("violet")
  })
})
