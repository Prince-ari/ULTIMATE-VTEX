import { describe, expect, it } from "vitest"

import { mysqlSslOption } from "./sslOption"

describe("mysqlSslOption", () => {
  it("active SSL pour une URL avec ssl-mode=REQUIRED (Aiven, PlanetScale...)", () => {
    const url = "mysql://avnadmin:secret@mysql-xxx.aivencloud.com:28102/defaultdb?ssl-mode=REQUIRED"
    expect(mysqlSslOption(url)).toEqual({ ssl: { rejectUnauthorized: true } })
  })

  it("insensible à la casse", () => {
    const url = "mysql://user:pass@host:3306/db?SSL-MODE=required"
    expect(mysqlSslOption(url)).toEqual({ ssl: { rejectUnauthorized: true } })
  })

  it("n'active rien pour une URL locale de dev sans ce paramètre", () => {
    const url = "mysql://vtex:vtex_dev_password@127.0.0.1:3306/vtex"
    expect(mysqlSslOption(url)).toEqual({})
  })

  it("ne plante jamais sur une valeur manquante", () => {
    expect(mysqlSslOption(undefined)).toEqual({})
  })

  it("inclut le certificat CA explicite s'il est fourni via DATABASE_CA_CERT", () => {
    const original = process.env.DATABASE_CA_CERT
    process.env.DATABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----"
    const url = "mysql://user:pass@host:3306/db?ssl-mode=REQUIRED"
    expect(mysqlSslOption(url)).toEqual({
      ssl: { rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----" },
    })
    process.env.DATABASE_CA_CERT = original
  })

  it("n'ajoute pas de champ ca si DATABASE_CA_CERT n'est pas défini", () => {
    const original = process.env.DATABASE_CA_CERT
    delete process.env.DATABASE_CA_CERT
    const url = "mysql://user:pass@host:3306/db?ssl-mode=REQUIRED"
    expect(mysqlSslOption(url)).toEqual({ ssl: { rejectUnauthorized: true } })
    process.env.DATABASE_CA_CERT = original
  })
})
