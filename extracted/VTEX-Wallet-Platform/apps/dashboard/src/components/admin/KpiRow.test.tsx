import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { KpiRow } from "./KpiRow"

describe("KpiRow", () => {
  it("affiche label et valeur de chaque item", () => {
    render(
      <KpiRow
        items={[
          { label: "Total comptes", value: "42" },
          { label: "Actifs", value: "38" },
        ]}
      />,
    )
    expect(screen.getByText("Total comptes")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("Actifs")).toBeInTheDocument()
    expect(screen.getByText("38")).toBeInTheDocument()
  })

  it("affiche le hint uniquement quand fourni", () => {
    render(
      <KpiRow
        items={[
          { label: "Avec hint", value: "1", hint: "détail" },
          { label: "Sans hint", value: "2" },
        ]}
      />,
    )
    expect(screen.getByText("détail")).toBeInTheDocument()
  })

  it("rend une liste vide sans planter", () => {
    const { container } = render(<KpiRow items={[]} />)
    expect(container.querySelectorAll(".rounded-lg")).toHaveLength(0)
  })
})
