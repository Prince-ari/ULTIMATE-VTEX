/**
 * mysql2 ne traduit PAS automatiquement `?ssl-mode=REQUIRED` (syntaxe
 * standard MySQL Shell/JDBC, utilisée par Aiven, PlanetScale, etc.)
 * présent dans une URI de connexion en configuration SSL réelle — ce
 * paramètre de requête est silencieusement ignoré par son parseur d'URI.
 * Sans ce correctif appliqué partout où une connexion mysql2 est ouverte,
 * la poignée de main tentée est non chiffrée, que la plupart des
 * fournisseurs managés (SSL obligatoire côté serveur) rejettent net.
 *
 * `DATABASE_CA_CERT` (optionnelle) : certificat CA explicite, à ne
 * renseigner QUE si la connexion échoue avec une erreur du type
 * "self signed certificate in certificate chain" ou "unable to verify
 * the first certificate" — signe que le fournisseur utilise une autorité
 * privée non couverte par le magasin de confiance public par défaut de
 * Node. Sans cette variable, `rejectUnauthorized: true` seul suffit pour
 * la plupart des fournisseurs managés (certificat signé par une autorité
 * publique reconnue). Ne jamais renseigner un certificat CA d'un AUTRE
 * fournisseur (ex: le bundle RDS d'AWS pour une base Aiven) — un
 * certificat CA n'est valide que pour SON émetteur, en mettre un
 * mauvais ne fait qu'échouer différemment, ça n'aide jamais.
 */
export function mysqlSslOption(
  databaseUrl: string | undefined,
): { ssl: { rejectUnauthorized: true; ca?: string } } | Record<string, never> {
  const requiresSsl = /[?&]ssl-?mode=REQUIRED/i.test(databaseUrl ?? "")
  if (!requiresSsl) return {}

  const ca = process.env.DATABASE_CA_CERT
  return { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } }
}
