import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ToastProvider, useToast } from "./Toast"

function Trigger() {
  const { show } = useToast()
  return <button type="button" onClick={() => show("Le service est indisponible.", "error")}>Déclencher une erreur</button>
}

function DuplicateTrigger() {
  const { show } = useToast()
  return <button type="button" onClick={() => { show("Le service est indisponible.", "error"); show("Le service est indisponible.", "error") }}>Déclencher un doublon</button>
}

describe("ToastProvider", () => {
  it("annonce les échecs de mutation comme une alerte accessible et permet de les fermer", async () => {
    const user = userEvent.setup()
    render(<ToastProvider><Trigger /></ToastProvider>)

    await user.click(screen.getByRole("button", { name: "Déclencher une erreur" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Le service est indisponible.")

    await user.click(screen.getByRole("button", { name: "Fermer" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("ne cumule pas deux alertes identiques pendant la même période de visibilité", async () => {
    const user = userEvent.setup()
    render(<ToastProvider><DuplicateTrigger /></ToastProvider>)

    await user.click(screen.getByRole("button", { name: "Déclencher un doublon" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Le service est indisponible.")
    expect(screen.getAllByRole("alert")).toHaveLength(1)
  })
})
