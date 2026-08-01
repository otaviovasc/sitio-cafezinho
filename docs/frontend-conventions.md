# Convenções de frontend

Padrões obrigatórios do app. Toda tela nova (e as existentes, à medida que forem tocadas) segue estes padrões. Referência viva: `src/client/pages/MilkCollectionPages.tsx` (`MilkCollectionForm`).

## O jogo é o shell

Desde a fase 6, `/` é o jogo e ele é a superfície central: **visualizar, criar e editar acontece nas folhas do jogo e no Caderno**, nunca em páginas novas do app. Para qualquer superfície nova:

- Use o kit do jogo (`docs/game-design.md`, seção "Game UI kit"): `GameSheet`/`GameEntitySheet` para entidades, aba ou seção do `GameNotebook` para listas, estilos `.game-*` e cores via tokens — nunca uma moldura ou paleta ad hoc.
- Página clássica (`.page` + `PageHeader`) só se justifica para **gráficos e auditoria**; nesse caso ela entra no hub `/graficos` e nos destinos de "voltar" (`components/ui.tsx`).
- O menu do `AppShell` é mínimo (Mapa, Caderno, Gráficos) e não cresce: funcionalidade nova ganha lugar no jogo, não item de menu.
- Formulários dentro das folhas usam as mesmas peças de sempre (abaixo) — o kit muda a moldura, não a disciplina de formulário.

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
- Revisões com várias etapas usam **`FactSequence`** (`components/fact-sequence.tsx`) e mantêm esta ordem visual reutilizável: **Origem → Contexto → Fatos/Medições → Mudanças derivadas → Confirmação**. A etapa atual precisa refletir o estado real; contexto incompleto nunca aparece como concluído.
- Em revisões longas, dê espaço aos campos: uma única rolagem, coluna principal larga no desktop, fontes ao lado quando couber e `SubmitBar` fixa. No celular, fontes e formulário empilham sem rolagem aninhada.
- Rótulo+tom de qualquer enum vem do **registro** `lib/status.ts` via **`StatusBadge`** — não escreva ternários de label/tom espalhados nas telas.

## Carregando / vazio / erro

- Carregando: `SkeletonList` (não "Carregando…" cru).
- Vazio de página: `EmptyState`. Vazio dentro de um card: texto curto/`InlineEmpty`.
- Erro de recurso: `ErrorState` com `retry`.
