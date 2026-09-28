/**
 * Motif « contient » pour un LIKE : les caractères joker (`%`, `_`) et l'antislash de la saisie sont échappés, donc recherchés tels quels.
 * (Les retirer, comme avant, rendait introuvables les adresses, préfixes de clé ou e-mails contenant un « _ ».)
 */
export function likeContains(input: string): string {
  return `%${input.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}