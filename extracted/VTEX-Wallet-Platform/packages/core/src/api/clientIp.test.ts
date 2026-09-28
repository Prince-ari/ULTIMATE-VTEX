import { afterEach, describe, expect, it } from "vitest"

import { clientIp } from "./context"

afterEach(() => {
  delete process.env.VTEX_TRUSTED_PROXY_HOPS
})

describe("clientIp — l'entrée falsifiable de X-Forwarded-For n'est jamais retenue", () => {
  it("prend l'entrée la plus à DROITE (celle qu'ajoute Nginx), pas la plus à gauche fournie par le client", () => {
    // Le client envoie « 1.1.1.1 » ; Nginx ajoute l'adresse réelle 203.0.113.9 à droite.
    expect(clientIp("1.1.1.1, 203.0.113.9", "10.0.0.2")).toBe("203.0.113.9")
    expect(clientIp("203.0.113.9", "10.0.0.2")).toBe("203.0.113.9")
  })

  it("sans en-tête, retombe sur l'adresse de la connexion ; sans rien, « unknown »", () => {
    expect(clientIp(undefined, "127.0.0.1")).toBe("127.0.0.1")
    expect(clientIp(null, null)).toBe("unknown")
  })

  it("VTEX_TRUSTED_PROXY_HOPS=0 ignore totalement l'en-tête ; =2 remonte de deux proxys", () => {
    process.env.VTEX_TRUSTED_PROXY_HOPS = "0"
    expect(clientIp("1.1.1.1, 203.0.113.9", "10.0.0.2")).toBe("10.0.0.2")
    process.env.VTEX_TRUSTED_PROXY_HOPS = "2"
    expect(clientIp("1.1.1.1, 203.0.113.9, 10.1.1.1", "10.0.0.2")).toBe("203.0.113.9")
  })

  it("une valeur de configuration invalide retombe sur le défaut sûr (1 proxy)", () => {
    process.env.VTEX_TRUSTED_PROXY_HOPS = "beaucoup"
    expect(clientIp("1.1.1.1, 203.0.113.9", null)).toBe("203.0.113.9")
  })

  it("borne la longueur (colonne varchar(45))", () => {
    expect(clientIp("x".repeat(200), null)).toHaveLength(45)
  })
})
