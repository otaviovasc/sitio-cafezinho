import { Field, FilterBar, Input, Select } from './ui';

// Kit único de filtro/busca das listas. Uma busca textual sempre visível e, no
// celular, os filtros extras entram num "Mais filtros" recolhível (mesma UX que
// já existia no rebanho). Cada tela passa só a configuração; o layout é comum.

export type SelectFilter = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

export function FilterControls({ search, selects = [] }: {
  search?: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string };
  selects?: SelectFilter[];
}) {
  const activeCount = selects.filter((select) => select.value && select.value !== 'ALL').length;
  const selectFields = selects.map((select) => (
    <Field key={select.label} label={select.label}>
      <Select value={select.value} onChange={(event) => select.onChange(event.target.value)}>
        {select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>
  ));

  return <FilterBar>
    {search && <Field label={search.label ?? 'Buscar'}>
      <Input type="search" value={search.value} onChange={(event) => search.onChange(event.target.value)} placeholder={search.placeholder} />
    </Field>}
    {selectFields.length > 0 && <>
      <div className="hidden gap-3 lg:flex">{selectFields}</div>
      <details className="rounded-xl border border-[var(--border)] px-3 py-2 lg:hidden">
        <summary className="cursor-pointer py-1 text-sm font-bold">Mais filtros{activeCount ? ' · ativos' : ''}</summary>
        <div className="mt-3 grid gap-3">{selectFields}</div>
      </details>
    </>}
  </FilterBar>;
}
