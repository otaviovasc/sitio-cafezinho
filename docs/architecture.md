# Arquitetura

O sistema é um monólito modular pequeno. React e Hono são compilados juntos; em produção, o Hono serve a API e o build da SPA no mesmo container. A escolha reduz operação sem misturar regras de negócio com detalhes HTTP ou de armazenamento.

## Direção das dependências

```text
src/domain       regras puras, parsing e formatação
      ↑
src/client       páginas, features e primitives de interface
src/server       HTTP, autenticação, serviços e portas de storage
      ↓
src/db           schema, migrations e seed PostgreSQL
```

- `src/domain` não conhece React, Hono, Drizzle, PostgreSQL ou Google.
- `src/domain/animal-lifecycle.ts` separa ciclo produtivo de lote; `src/domain/herd.ts` concentra a semântica da rotina de ordenha. Nomes de lotes permanecem dados do PostgreSQL.
- `src/server/routes` valida entrada e traduz HTTP; operações com mais de uma gravação ficam em serviços transacionais.
- `src/server/storage` contém a porta de arquivos e as implementações local/Google Drive escolhidas no composition root.
- `src/client/features` concentra fluxos reutilizáveis; `pages` compõe as rotas e `components/ui.tsx` mantém as primitives do design system.
- `src/db` é a fonte do modelo persistente. Toda mudança de schema exige migration.

## Limites de crescimento

Novas regras começam em `domain` quando forem independentes de infraestrutura. Novas integrações implementam uma porta estreita em `server`; não criam microserviço por padrão. Um novo módulo só ganha pasta própria quando possuir fluxo, regras e testes reais — não por antecipação.

O armazenamento segue o mesmo contrato nos dois ambientes:

- local: volume Docker em `/data/uploads`;
- produção: uma pasta Google Drive definida por variável de ambiente.

Metadados ficam sempre no PostgreSQL. Segredos são lidos apenas no servidor e não entram no banco nem no bundle React.

Situações, reprodução e lotações seguem modelos temporais pequenos. `animal_status_events` preserva transições produtivas; o campo atual em `animals` é a projeção rápida. `animal_reproductive_events` guarda cio, cobertura, resultado e o parto ligado à entrada em lactação, sem transformar prenhez em situação. O lote guarda apenas a rotina de ordenha e `animal_group_assignments` guarda os intervalos operacionais. O controle individual consulta situação e lote válidos na data informada. Criação e edição de lotes acontecem pelo `GroupPicker` reutilizado nos fluxos do animal, sem página administrativa isolada.

`daily_milk_totals` representa a produção total do rebanho nos dias sem controle individual. Novos registros persistem manhã e tarde e derivam o total; linhas históricas sem períodos continuam explícitas e não recebem rateio retroativo.

Pesagens usam `weight_sessions` como cabeçalho da operação e `animal_weights` como linhas revisáveis. Isso permite sessão parcial, origem da transcrição, linhas sem vínculo e valores duvidosos sem perder o histórico individual confirmado.
