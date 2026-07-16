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

`daily_milk_totals` representa produção agregada com escopo opcional em `herd_group_id`: `null` significa rebanho todo e um UUID significa medição separada daquele lote. A unicidade é por data e escopo. Linhas anteriores à migration permanecem `null`, sem conversão ou rateio. A projeção geral prefere o total do rebanho; quando ele não existe, soma apenas os lotes registrados e informa essa base, evitando dupla contagem quando ambos coexistem. Lote de ordenha somente matinal mantém `afternoon_liters = null`.

`milk_sessions` e `milk_measurements` representam controles individuais pontuais. Produção agregada e controle individual podem existir na mesma data, não se sobrescrevem e não são usados para completar um ao outro. Novos totais agregados derivam o total dos períodos informados; linhas históricas sem períodos continuam explícitas e não recebem rateio retroativo.

`milk_collections` representa retiradas do laticínio. Várias coletas podem existir no mesmo dia e nenhuma delas cria ou altera produção. A comparação diária é uma projeção de consulta entre fatos independentes.

`mastitis_cases` guarda somente fatos observados e decisões humanas; `mastitis_actions` guarda lembretes programados ou concluídos. Carência é uma data informada, nunca uma liberação clínica automática. O histórico pertence ao animal e as pendências são projetadas na página Hoje.

`revenues` complementa compras com entradas esperadas, recebidas ou canceladas. `animal_exits` estende o evento de situação `SOLD` ou `DEAD` sem substituir `animal_status_events`. Venda e criação/vínculo de receita acontecem na mesma transação para garantir no máximo uma receita; morte não recebe dados comerciais.

`attachments` continua sendo a única infraestrutura documental. Uma constraint permite no máximo um pai entre compra, controle individual, coleta, receita e saída, preservando também documentos ainda sem vínculo.

A rota `/api/dashboard` é uma projeção operacional: lê fatos existentes para montar Hoje e a visão mensal, mas não grava pendências nem completa datas ausentes. As rotas `/api/data-exports` produzem CSVs; backup completo continua a cargo de `pg_dump`/`pg_restore` 17 pelos scripts em `scripts/`.

Pesagens usam `weight_sessions` como cabeçalho da operação e `animal_weights` como linhas revisáveis. Isso permite sessão parcial, origem da transcrição, linhas sem vínculo e valores duvidosos sem perder o histórico individual confirmado.
