export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const compact = value.trim().replace(/\s/g, '');
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  let normalized = compact;
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    normalized = compact.replace(groupingSeparator, '').replace(decimalSeparator, '.');
  } else if ((compact.match(/,/g)?.length ?? 0) > 1) {
    normalized = compact.replace(/,/g, '');
  } else if ((compact.match(/\./g)?.length ?? 0) > 1) {
    normalized = compact.replace(/\./g, '');
  } else {
    normalized = compact.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function decimalString(value: string | number): string {
  const parsed = parseDecimal(value);
  if (parsed === null) throw new Error('Valor decimal inválido.');
  return parsed.toFixed(2);
}

export function formatLiters(value: string | number): string {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
}

export function formatMoney(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
