export function dateKeyInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isOverdue(purchase: { status: string; dueDate: string | null }, today = new Date()) {
  if (purchase.status !== 'OPEN' || !purchase.dueDate) return false;
  return purchase.dueDate < dateKeyInSaoPaulo(today);
}

export function itemDifference(total: number, items: Array<{ totalPrice: number | string }>) {
  const itemTotal = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  return Math.round((itemTotal - total) * 100) / 100;
}
