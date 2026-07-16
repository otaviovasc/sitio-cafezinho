import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { parseDecimal } from '../../domain/format';
import { Input } from './ui';
import { formatDecimalInput, maskDecimalInput } from '../lib/form-format';

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string | number | null;
  onValueChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function DecimalInput({
  value,
  onValueChange,
  prefix,
  suffix,
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
  onBlur,
  ...props
}: DecimalInputProps) {
  const input = <Input
    {...props}
    type="text"
    inputMode="decimal"
    value={value ?? ''}
    onChange={(event) => onValueChange(maskDecimalInput(event.target.value, maximumFractionDigits))}
    onBlur={(event) => {
      onValueChange(formatDecimalInput(event.target.value, minimumFractionDigits, maximumFractionDigits));
      onBlur?.(event);
    }}
  />;

  if (!prefix && !suffix) return input;
  return <div className="input-shell">
    {prefix && <span className="input-adornment" aria-hidden>{prefix}</span>}
    {input}
    {suffix && <span className="input-adornment" aria-hidden>{suffix}</span>}
  </div>;
}

export function MoneyInput(props: Omit<DecimalInputProps, 'prefix' | 'minimumFractionDigits' | 'maximumFractionDigits'>) {
  return <DecimalInput {...props} prefix="R$" minimumFractionDigits={2} maximumFractionDigits={2} />;
}

export function LitersInput(props: Omit<DecimalInputProps, 'suffix' | 'minimumFractionDigits' | 'maximumFractionDigits'>) {
  return <DecimalInput {...props} suffix="L" maximumFractionDigits={2} />;
}

export function WeightInput(props: Omit<DecimalInputProps, 'suffix' | 'minimumFractionDigits' | 'maximumFractionDigits'>) {
  return <DecimalInput {...props} suffix="kg" maximumFractionDigits={2} />;
}

type ParsedDecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string | number | null;
  onValueChange: (value: number | null) => void;
  suffix?: string;
};

export function ParsedDecimalInput({ value, onValueChange, suffix, onFocus, onBlur, ...props }: ParsedDecimalInputProps) {
  const focused = useRef(false);
  const [draft, setDraft] = useState(() => formatDecimalInput(value));
  useEffect(() => {
    if (!focused.current) setDraft(formatDecimalInput(value));
  }, [value]);

  return <DecimalInput
    {...props}
    suffix={suffix}
    value={draft}
    onValueChange={(next) => {
      setDraft(next);
      if (!next) onValueChange(null);
      else {
        const parsed = parseDecimal(next);
        if (parsed !== null) onValueChange(parsed);
      }
    }}
    onFocus={(event) => { focused.current = true; onFocus?.(event); }}
    onBlur={(event) => {
      focused.current = false;
      const parsed = parseDecimal(event.target.value);
      setDraft(formatDecimalInput(parsed));
      onValueChange(parsed);
      onBlur?.(event);
    }}
  />;
}
