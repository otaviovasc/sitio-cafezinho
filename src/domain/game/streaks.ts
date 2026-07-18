/**
 * Streaks de registro: dias consecutivos com dado registrado. Sempre derivados
 * das datas reais (nunca armazenados) — edição retroativa recalcula tudo.
 * Regra do "hoje ou ontem": o registro do dia pode ainda não ter acontecido de
 * manhã, então a sequência atual vale se termina hoje OU ontem.
 */

function previousDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function computeStreak(dates: string[], today: string): { current: number; best: number } {
  const unique = [...new Set(dates)].filter((date) => date <= today).sort();
  if (!unique.length) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    run = unique[index - 1] === previousDay(unique[index]) ? run + 1 : 1;
    if (run > best) best = run;
  }

  const last = unique[unique.length - 1];
  if (last !== today && last !== previousDay(today)) return { current: 0, best };
  let current = 1;
  for (let index = unique.length - 1; index > 0; index -= 1) {
    if (unique[index - 1] !== previousDay(unique[index])) break;
    current += 1;
  }
  return { current, best };
}
