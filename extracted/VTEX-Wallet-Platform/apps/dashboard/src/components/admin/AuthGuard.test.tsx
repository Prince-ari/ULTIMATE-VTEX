import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  clearToken: vi.fn(),
  query: vi.fn(),
  replace: vi.fn(),
  router: null as unknown as { replace: ReturnType<typeof vi.fn> },
  pathname: "/",
}))

mocks.router = { replace: mocks.replace }

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
}))

vi.mock("@/lib/trpc", () => ({
  api: { users: { getMe: { query: mocks.query } } },
  clearToken: mocks.clearToken,
}))

import { AuthGuard } from "./AuthGuard"

describe("AuthGuard", () => {
  beforeEach(() => {
    mocks.clearToken.mockReset()
    mocks.query.mockReset()
    mocks.replace.mockReset()
    mocks.pathname = "/"
  })

  it("conserve la session et propose une reprise lors d’une erreur réseau", async () => {
    mocks.query.mockRejectedValue(new Error("Réseau indisponible"))
    const user = userEvent.setup()

    render(<AuthGuard><p>Surface protégée</p></AuthGuard>)

    expect(await screen.findByText("Connexion au Dashboard indisponible")).toBeInTheDocument()
    expect(screen.getByText("Connexion indisponible")).toBeInTheDocument()
    expect(screen.getByText(/La session locale est conservée/)).toBeInTheDocument()
    expect(mocks.clearToken).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()

    mocks.query.mockResolvedValue({ role: "admin" })
    await user.click(screen.getByRole("button", { name: "Réessayer" }))
    await waitFor(() => expect(screen.getByText("Surface protégée")).toBeInTheDocument())
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

  it("redirige vers la connexion uniquement lorsque la session est invalide", async () => {
    mocks.query.mockRejectedValue({ data: { httpStatus: 401, code: "UNAUTHORIZED" } })

    render(<AuthGuard><p>Surface protégée</p></AuthGuard>)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"))
    expect(mocks.clearToken).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Connexion au Dashboard indisponible")).not.toBeInTheDocument()
  })

  it("explique une permission insuffisante sans présenter les données protégées", async () => {
    mocks.query.mockResolvedValue({ role: "user" })
    const user = userEvent.setup()

    render(<AuthGuard><p>Surface protégée</p></AuthGuard>)

    expect(await screen.findByText("Accès opérateur requis")).toBeInTheDocument()
    expect(screen.queryByText("Surface protégée")).not.toBeInTheDocument()
    expect(mocks.clearToken).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Revenir à la connexion" }))
    expect(mocks.clearToken).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith("/login")
  })
  it("un gestionnaire de compte n'entre que par son portefeuille : ailleurs, rien n'est affiché et il est ramené à son accueil", async () => {
    mocks.query.mockResolvedValue({ id: 7, role: "account_manager", firstName: "Camille", lastName: "Rousseau", mustChangePassword: false })
    mocks.pathname = "/utilisateurs"

    render(<AuthGuard><p>Surface protégée</p></AuthGuard>)

    expect(await screen.findByText("Retour à votre portefeuille")).toBeInTheDocument()
    expect(screen.queryByText("Surface protégée")).not.toBeInTheDocument()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/portefeuille"))
  })

  it("un gestionnaire de compte voit ses pages (portefeuille, suggestions)", async () => {
    mocks.query.mockResolvedValue({ id: 7, role: "account_manager", firstName: "Camille", lastName: "Rousseau", mustChangePassword: false })
    mocks.pathname = "/portefeuille"

    render(<AuthGuard><p>Surface protégée</p></AuthGuard>)

    expect(await screen.findByText("Surface protégée")).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
