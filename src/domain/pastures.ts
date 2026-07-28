/**
 * Linhagem da subdivisão de pastos (regra de domínio, compartilhada entre
 * servidor e cliente): subdividir desativa o pasto original e cria os novos
 * com a linhagem no nome — “Pasto 1” vira “Pasto 1.a”, “Pasto 1.b”…, sem
 * hierarquia. Ocupações antigas continuam apontando para o pasto original.
 */
const SUBDIVISION_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function subdivisionName(baseName: string, index: number): string {
  return `${baseName}.${SUBDIVISION_LETTERS[index]}`;
}
