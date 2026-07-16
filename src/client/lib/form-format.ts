import { parseDecimal } from '../../domain/format';

export function maskDecimalInput(rawValue: string, maximumFractionDigits = 2): string {
  const compact = rawValue.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  const negative = compact.startsWith('-');
  const unsigned = compact.replace(/-/g, '');
  const separators = [...unsigned].map((character, index) => character === ',' || character === '.' ? index : -1).filter((index) => index >= 0);
  if (!separators.length) return `${negative ? '-' : ''}${unsigned.replace(/\D/g, '')}`;

  const decimalIndex = separators.at(-1) ?? -1;
  const integer = unsigned.slice(0, decimalIndex).replace(/\D/g, '') || '0';
  const fraction = unsigned.slice(decimalIndex + 1).replace(/\D/g, '').slice(0, maximumFractionDigits);
  return `${negative ? '-' : ''}${integer},${fraction}`;
}

export function formatDecimalInput(value: string | number | null | undefined, minimumFractionDigits = 0, maximumFractionDigits = 2): string {
  const parsed = parseDecimal(value);
  if (parsed === null) return value === null || value === undefined ? '' : String(value);
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits, maximumFractionDigits, useGrouping: false });
}
