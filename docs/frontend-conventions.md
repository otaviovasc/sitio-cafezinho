# Convenções de frontend

Padrões obrigatórios do app. Toda tela nova (e as existentes, à medida que forem tocadas) segue estes padrões. Referência viva: `src/client/pages/MilkCollectionPages.tsx` (`MilkCollectionForm`).

## Formulários

Um formulário padrão combina quatro peças:

- **`useForm(initial, validators)`** (`hooks/useForm.ts`) — estado, validação e "sujo".
  Validação **cedo, sem incomodar**: o erro de um campo só aparece depois do blur ou do submit; a partir daí é revalidado ao vivo enquanto a pessoa digita (some quando corrige). Nunca mostra erro em campo ainda não tocado.
- **`useSubmit()`** (`hooks/useSubmit.ts`) — `busy`/`error`/`run(task)`. Remove o try/finally repetido; converte `ApiError` em mensagem amigável.
- **`SubmitBar`** (`components/ui.tsx`) — ação de envio única, fixa acima da barra de abas no celular, inline no desktop.
- **`useUnsavedGuard(dirty)`** (`hooks/useUnsavedGuard.ts`) — avisa antes de recarregar/fechar com alterações não salvas.

Receita padrão:

```tsx
const { busy, error, run } = useSubmit();
const form = useForm(
  { nome: '', litros: '' },
  {
    nome: (v) => (v.trim() ? undefined : 'Informe o nome.'),
    litros: (v) => { const n = parseDecimal(v); return n && n > 0 ? undefined : 'Informe um valor maior que zero.'; },
  },
);
useUnsavedGuard(form.dirty);

async function persist() { /* usa form.values; lança em erro para o useSubmit mostrar */ }

return <form noValidate onSubmit={(e) => { e.preventDefault(); if (form.validate()) void run(persist); }}>
  {error && <ErrorState message={error} />}
  <FormErrorSummary errors={form.visibleErrors} />
  <Field label="Nome" error={form.error('nome')}>
    <Input value={form.values.nome} onChange={(e) => form.set('nome', e.target.value)} onBlur={() => form.blur('nome')} required autoFocus />
  </Field>
  <SubmitBar label="Salvar" busy={busy} />
</form>;
```

Regras: use `Field` (rótulo + dica + erro + aria), `FormErrorSummary` no topo (foco gerenciado), `autoFocus` no campo principal, e os controles de `components/form-controls.tsx` para números (teclado decimal pt-BR). Preserve os valores em erro; nunca limpe o formulário ao falhar.

## Revisão / status

- Revisar uma entrada proposta usa **`ReviewCard`** (`components/review.tsx`): decisão com faixa de triagem, um problema em destaque, barra de ações. Não repita grades de `<Select>` por linha.
- Rótulo+tom de qualquer enum vem do **registro** `lib/status.ts` via **`StatusBadge`** — não escreva ternários de label/tom espalhados nas telas.

## Carregando / vazio / erro

- Carregando: `SkeletonList` (não "Carregando…" cru).
- Vazio de página: `EmptyState`. Vazio dentro de um card: texto curto/`InlineEmpty`.
- Erro de recurso: `ErrorState` com `retry`.
