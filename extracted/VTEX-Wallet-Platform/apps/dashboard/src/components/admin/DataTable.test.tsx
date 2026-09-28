import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DataTable } from "./DataTable"

interface Row {
  id: number
  name: string
}

const rows: Row[] = [
  { id: 1, name: "Amara" },
  { id: 2, name: "Fadel" },
]

describe("DataTable", () => {
  it("affiche l'état vide avec le label par défaut", () => {
    render(
      <DataTable<Row>
        columns={[{ header: "Nom", render: (r) => r.name }]}
        rows={[]}
        getRowKey={(r) => r.id}
      />,
    )
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument()
  })

  it("affiche l'état vide avec un label personnalisé", () => {
    render(
      <DataTable<Row>
        columns={[{ header: "Nom", render: (r) => r.name }]}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyLabel="Aucun utilisateur ne correspond à ces filtres."
      />,
    )
    expect(screen.getByText("Aucun utilisateur ne correspond à ces filtres.")).toBeInTheDocument()
  })

  it("rend une ligne par élément, avec les colonnes définies", () => {
    render(
      <DataTable<Row>
        columns={[{ header: "Nom", render: (r) => r.name }]}
        rows={rows}
        getRowKey={(r) => r.id}
      />,
    )
    expect(screen.getByText("Amara")).toBeInTheDocument()
    expect(screen.getByText("Fadel")).toBeInTheDocument()
    expect(screen.getAllByRole("row")).toHaveLength(3) // 1 header + 2 données
  })

  it("clic sur une ligne appelle onRowClick avec la bonne donnée", async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <DataTable<Row>
        columns={[{ header: "Nom", render: (r) => r.name }]}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    )
    await user.click(screen.getByText("Fadel"))
    expect(onRowClick).toHaveBeenCalledWith(rows[1])
  })

  it("sans onRowClick, aucune erreur au clic (pas de handler à appeler)", async () => {
    const user = userEvent.setup()
    render(
      <DataTable<Row>
        columns={[{ header: "Nom", render: (r) => r.name }]}
        rows={rows}
        getRowKey={(r) => r.id}
      />,
    )
    await expect(user.click(screen.getByText("Amara"))).resolves.not.toThrow()
  })
})
