/**
 * Regra visual do tanque da mangueira: fração (0–1) da produção de hoje que
 * ainda não foi coletada pelo laticínio. Sem produção registrada, tanque vazio
 * — o jogo nunca inventa leite (anti-inferência).
 */
export function tankLevel(producedLiters: number | null, collectedLiters: number): number {
  if (producedLiters === null || producedLiters <= 0) return 0;
  const remaining = producedLiters - collectedLiters;
  return Math.min(1, Math.max(0, remaining / producedLiters));
}
