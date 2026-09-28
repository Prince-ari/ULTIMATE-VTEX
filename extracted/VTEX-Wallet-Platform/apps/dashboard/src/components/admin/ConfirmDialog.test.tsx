import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialog } from "./ConfirmDialog"

describe("ConfirmDialog", () => {
  it("n'affiche rien quand open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Suspendre ce compte ?"
        description="Détail"
        confirmLabel="Confirmer"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByText("Suspendre ce compte ?")).not.toBeInTheDocument()
  })

  it("affiche titre et description quand open=true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Suspendre ce compte ?"
        description="Amara Diallo perdra l'accès."
        confirmLabel="Confirmer"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText("Suspendre ce compte ?")).toBeInTheDocument()
    expect(screen.getByText("Amara Diallo perdra l'accès.")).toBeInTheDocument()
  })

  it("Annuler ferme sans appeler onConfirm", async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Titre"
        description="Description"
        confirmLabel="Confirmer"
        onConfirm={onConfirm}
      />,
    )
    await user.click(screen.getByText("Annuler"))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("le bouton de confirmation appelle onConfirm PUIS ferme le dialogue", async () => {
    const calls: string[] = []
    const onConfirm = vi.fn(() => calls.push("confirm"))
    const onOpenChange = vi.fn(() => calls.push("close"))
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Supprimer ce compte ?"
        description="Irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={onConfirm}
      />,
    )
    await user.click(screen.getByText("Supprimer"))
    expect(calls).toEqual(["confirm", "close"])
  })

  it("le libellé du bouton de confirmation est celui fourni, jamais générique", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Titre"
        description="Description"
        confirmLabel="Bloquer définitivement"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText("Bloquer définitivement")).toBeInTheDocument()
  })
})
