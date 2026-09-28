import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { FilterBar } from "./FilterBar"

describe("FilterBar", () => {
  it("appelle onSearchChange à chaque frappe", async () => {
    const onSearchChange = vi.fn()
    const user = userEvent.setup()
    render(
      <FilterBar
        search=""
        onSearchChange={onSearchChange}
        filters={[{ label: "Tous", value: "all" }]}
        activeFilter="all"
        onFilterChange={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText("Rechercher..."), "Amara")
    expect(onSearchChange).toHaveBeenCalledTimes(5) // une fois par caractère
    expect(onSearchChange).toHaveBeenLastCalledWith("a") // contrôlé, la valeur ne s'accumule pas ici
  })

  it("clic sur une pill appelle onFilterChange avec sa valeur", async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    render(
      <FilterBar
        search=""
        onSearchChange={vi.fn()}
        filters={[
          { label: "Tous", value: "all" },
          { label: "Actifs", value: "active" },
        ]}
        activeFilter="all"
        onFilterChange={onFilterChange}
      />,
    )
    await user.click(screen.getByText("Actifs"))
    expect(onFilterChange).toHaveBeenCalledWith("active")
  })

  it("la pill active est exposée comme pressée (le style Leg Day s'appuie sur aria-pressed)", () => {
    render(
      <FilterBar
        search=""
        onSearchChange={vi.fn()}
        filters={[
          { label: "Tous", value: "all" },
          { label: "Actifs", value: "active" },
        ]}
        activeFilter="active"
        onFilterChange={vi.fn()}
      />,
    )
    expect(screen.getByText("Actifs")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Tous")).toHaveAttribute("aria-pressed", "false")
  })

  it("respecte le placeholder personnalisé", () => {
    render(
      <FilterBar
        search=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Nom ou email..."
        filters={[]}
        activeFilter="all"
        onFilterChange={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText("Nom ou email...")).toBeInTheDocument()
  })
})
