import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Estado de formulário com validação "cedo, mas sem incomodar": o erro de um
 * campo só aparece depois que a pessoa sai dele (blur) ou tenta salvar; a partir
 * daí ele é revalidado ao vivo enquanto digita (some assim que corrige). Nunca
 * mostra erro num campo ainda não tocado. Padrão único de formulário do app.
 */

type Validator<T, K extends keyof T> = (value: T[K], all: T) => string | undefined;
export type Validators<T> = { [K in keyof T]?: Validator<T, K> };

export function useForm<T extends Record<string, unknown>>(initial: T, validators: Validators<T> = {}) {
  const [values, setValuesState] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string | undefined>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const initialRef = useRef(initial);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const touchedRef = useRef(touched);
  touchedRef.current = touched;

  const validateField = useCallback(<K extends keyof T>(key: K, all: T) => validators[key]?.(all[key], all), [validators]);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    const next = { ...valuesRef.current, [key]: value };
    setValuesState(next);
    if (touchedRef.current[key]) setErrors((prev) => ({ ...prev, [key]: validateField(key, next) }));
  }, [validateField]);

  const blur = useCallback(<K extends keyof T>(key: K) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: validateField(key, valuesRef.current) }));
  }, [validateField]);

  const validate = useCallback((): boolean => {
    const nextErrors: Partial<Record<keyof T, string | undefined>> = {};
    const nextTouched: Partial<Record<keyof T, boolean>> = {};
    let ok = true;
    for (const key of Object.keys(validators) as (keyof T)[]) {
      const message = validators[key]?.(valuesRef.current[key], valuesRef.current);
      nextErrors[key] = message;
      nextTouched[key] = true;
      if (message) ok = false;
    }
    setErrors(nextErrors);
    setTouched(nextTouched);
    return ok;
  }, [validators]);

  const error = useCallback(<K extends keyof T>(key: K) => (touched[key] ? errors[key] : undefined), [errors, touched]);

  const reset = useCallback((next?: T) => {
    const base = next ?? initialRef.current;
    initialRef.current = base;
    setValuesState(base);
    setErrors({});
    setTouched({});
  }, []);

  const setValues = useCallback((updater: (current: T) => T) => setValuesState((current) => updater(current)), []);

  const visibleErrors = useMemo(() => (Object.keys(errors) as (keyof T)[]).filter((key) => touched[key]).map((key) => errors[key]), [errors, touched]);

  const dirty = useMemo(
    () => (Object.keys(initialRef.current) as (keyof T)[]).some((key) => values[key] !== initialRef.current[key]),
    [values],
  );

  return { values, set, blur, validate, error, visibleErrors, dirty, reset, setValues };
}
