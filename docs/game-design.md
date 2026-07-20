# Design do jogo — "Tabuleiro do Sítio" (/jogo)

Fonte única de verdade do design da camada de jogo. Toda convenção nova criada
durante a implementação DEVE ser registrada aqui. Referências de arte escolhidas
pelo usuário: **Mini Motorways/Mini Metro** (paleta enxuta, iconografia, limpeza
de UI), **Dorfromantik** (linguagem pastoral de campos, pastel calmo),
**ISLANDERS** (feel de posicionamento, HUD discreto).

## Regra de ouro

O jogo é uma lente sobre dados reais. **Toda ação do jogo grava um fato real
pelos endpoints validados existentes** (`/api/daily-milk-totals`,
`/api/milk-collections`, `/api/milk-sessions`, …). Zero moeda fictícia, zero
simulação, zero endpoint de escrita próprio para fatos de fazenda. Streaks e
economia são sempre derivados, nunca armazenados.

Pasto e mapa são a mesma entidade (decisão 2026-07-20): toda zona PASTURE
vincula um pasto real — sem vínculo escolhido, o editor cria o pasto pelo
`POST /api/pastures` antes de salvar a zona, e `/pastos` oferece "Desenhar no
mapa" (`/jogo/mapa/editor?pasto=<id>`) para pastos ainda não desenhados. A
área do pasto (`area_ha`) é a **medição do traçado**: salvar/retraçar a zona
grava os hectares calculados por `ringAreaHa()` via
`syncPastureAreaFromRing()` no pasture.service — exceção deliberada e única à
escrita de fato de fazenda a partir das rotas do jogo.

## Direção de arte

- **Assinatura:** o traçado bruto do GPS vira brinquedo. Perímetro e pastos
  renderizam EXATAMENTE os pontos traçados no editor (decisão do usuário):
  sem suavização — o que a pessoa marcou no satélite é o que aparece no
  jogo. O perímetro recebe sombra suave (`feDropShadow` único em
  `GameDefs`) — o sítio parece um diorama recortado sobre uma mesa.
- **Estilo:** flat vetorial top-down. Sem outline preto, gradientes com no
  máximo 2 stops, ruído zero. Formas arredondadas e amigáveis.
- **Cor:** no máximo **2 cores de destaque por cena** (telhado `roof`, leite no
  tanque); todo o resto é campo pastel. Paleta completa e nomeada em
  `src/client/features/game/tokens.ts` — nunca hex solto em componente.
- **Chão e limite:** TODO o interior do perímetro é GRAMA (gradiente
  `game-ground-grass` + padrão de tufos em opacidade cheia), nunca terra crua;
  os pastos são o mesmo capim em tons do patchwork. O limite do sítio é uma
  cerca de verdade — trilhos de madeira + mourões equiespaçados
  (`spacedPointsAlongRing`, `gameTokens.fence`), grupo
  `data-testid="game-fence"` com `data-post-count`. Cada PASTO recebe a MESMA
  cerca em madeira mais clara (`woodLight`/`woodLightDark`,
  `game-fence-pasture-{id}`), seguindo o contorno exato do traçado.
- **Contenção:** pastos e instalações não existem fora do perímetro — o
  servidor recusa (`PASTURE_OUTSIDE_PERIMETER`,
  `INSTALLATION_OUTSIDE_PERIMETER`; validação por vértice com
  `pointInPolygon`).
- **Folhas de instalação:** AÇÕES sempre em cima; listagens (estoque, animais)
  vêm depois.
- **Câmera como moldura:** escala mínima = 1 (o enquadramento do sítio inteiro,
  com a margem do `paddingRatio` da projeção); o pan trava suavemente nos
  limites do terreno (`clampCamera` puro em `src/domain/game/camera.ts`) — não
  existe navegar para fora do mapa.

| Token | Hex | Uso |
|---|---|---|
| `paper` | `#F5F0E4` | A "mesa" fora do perímetro |
| `grass` / `grassLight` | `#ADBF8B` / `#BFCF9E` | Chão do sítio dentro da cerca (gradiente `game-ground-grass` + tufos `game-grass`; mais amuado que os pastos de propósito) |
| `pasture[0..2]` | `#B7CE93` `#A4C17E` `#C9DBA8` | Patchwork dos pastos (`styleVariant` cíclico) |
| `meadowEdge` | `#8FA96B` | Traço entre pastos |
| `dirt` | `#D9BC90` | Curral, entorno da mangueira |
| `wood` / `woodDark` | `#8A6F4D` / `#6E5638` | Cerca do perímetro e mourões (testa escura) |
| `woodLight` / `woodLightDark` | `#B29A76` / `#95805D` | Cerca dos pastos (a mesma cerca, mais clara) |
| `roof` | `#D98E73` | Telhados (accent quente, com parcimônia) |
| `milk` / `steel` | `#FFF9EF` / `#9FB4C7` | Tanque de leite |
| `ink` | `#3A3D35` | Rótulos e ícones no mapa |
| `tree` / `treeShade` | `#6E8F57` / `#5A7A46` | Árvores |
| `cow` / `cowSpot` | `#F7F2E9` / `#4A443C` | Vacas |
| `crop` / `cropRipe` | `#7DA854` / `#E4C465` | Plantação: cultura crescendo / pronta (dourado) |

## Tipografia

- Corpo e formulários do app continuam com a fonte padrão (`--font`).
- Dentro de `.game-root` a família é **Nunito Variable**
  (`@fontsource-variable/nunito`, self-hosted, importada em `GameShell.tsx`).
- Números do HUD: peso 800, `font-variant-numeric: tabular-nums`.
- Rótulos de HUD: caixa alta pequena, tracking largo (`small` do `.game-hud-chip`).

## HUD e folhas de ação — fluidos e ambientados (exigência do usuário)

O HUD **vive dentro do mundo do jogo**, nunca parece um app por cima dele:

- Chips flutuantes (`.game-hud-chip`): fundo `#FFFEF9`, canto full-rounded,
  sombra suave, Nunito. Economia embaixo à esquerda, streak em cima à direita.
  Colapsáveis no mobile. Nada de painel opaco cobrindo o mapa.
- A folha de ações de uma instalação (`GameActionSheet`) NÃO usa o `Modal`
  padrão do app: é uma folha própria `.game-sheet` que desliza da borda
  inferior (220ms ease-out, `sheetMs`), com fundo `paper`, cabeçalho com o
  sprite da instalação e botões-cartão no estilo do jogo. Acessibilidade igual
  ao Modal (focus trap, Esc fecha, `role="dialog"`).
- A moldura comum das folhas vive em `GameSheet.tsx` (portal + backdrop +
  focus trap + Esc + retorno de foco). Toda folha nova (`GameGroupSheet`,
  folhas de instalações) monta o conteúdo dentro dela — nunca reimplementar o
  trap nem usar o Modal padrão.
- O rebanho no pasto também é clicável: `herd-cluster-{groupId}` é um botão SVG
  (Enter/Espaço) que abre a folha do LOTE (`game-group-sheet`) com contagem
  real, lista de animais e ações rápidas por endpoints reais (cio, situação,
  link para a ficha).
- Ações pendentes/urgências (fase futura de missões) aparecem como marcadores
  no próprio mapa + lista na folha, sempre com a regra que as gerou visível
  ("Coleta de hoje não registrada — regra: toda tarde há coleta").

## Movimento

Poucos momentos, orquestrados, todos em CSS e desligados por
`prefers-reduced-motion` (bloco global já existente em `styles.css`):

1. Load: diorama "assenta" (`game-settle`, 400ms, uma vez).
2. Registro de produção: tanque enche com ease-out até `data-level`.
3. Registro de coleta: caminhão atravessa uma vez (`data-state="driving"`).
4. Editor: vértice pulsa 1x ao ser adicionado.
5. Folha de ações desliza (220ms).

Idle em loop era proibido; exceções deliberadas (pedido do usuário, 2026-07-18):

6. **Vacas pastando**: cada sprite vagueia devagar (`.game-cow`,
   `game-cow-graze`, alternate infinite). Deslocamento/duração/atraso são
   determinísticos por vaca (`herdGrazeMotion` em `domain/game/herd-layout.ts`,
   seed = groupId; amplitude ±12 unidades para não encostar na cerca) e entram
   como CSS custom props `--cow-*`. `prefers-reduced-motion` desliga tudo.
7. **Selo "Colher!"** da Plantação pulsa suave (`game-ready-pulse`) enquanto
   `stage = READY`.

Fora isso, sem idle-animations. Estados animados SEMPRE espelhados em
atributos `data-*` para asserção sem pixels.

## Áudio (trilha + efeitos)

- Gerente único em `src/client/features/game/audio.ts`; hook `useGameAudio`
  liga tudo enquanto `/jogo` está montada. Nada de `new Audio` solto em
  componente.
- **Arquivos reais em `public/audio/game/`** (nomes fixos em
  `GAME_AUDIO_FILES`; tabela no README da pasta). Arquivo ausente → placeholder
  sintetizado via WebAudio toca no lugar — o repo não versiona binários.
- Autoplay: nada toca antes do primeiro gesto; a trilha (volume 0.32, loop)
  começa no primeiro toque e pausa quando a aba perde o foco.
- Mudo global persistido em `localStorage['game-audio-muted']`; botão redondo
  `game-audio-toggle` (`data-muted`) no HUD, topo direito abaixo do streak.
- Mapa evento → som: rebanho `moo`; abrir instalação `click`; produção `pour`;
  coleta `truck`; trato (ordenha/estação) `feed`; plantio `plant`; colheita
  `harvest`; compra na Loja `buy`; confirmações genéricas `success`.
- Em produção o servidor serve `/audio/*` de `dist/client` (Vite copia
  `public/` no build).

## Loja do sítio

A porta de entrada de compras do jogo (chip "Loja" no HUD, botão no Depósito e
atalho na Plantação): vitrine por categoria (sementes, fertilizantes, ração e
sal, saúde, ordenha, combustível, manutenção) com itens populares e **tudo
editável como placeholder** (`loja-catalog.ts` — nada ali é fato): quantidade
de pacotes (`packNoun`: saco, frasco, bombona…), tamanho do pacote na unidade
canônica (o "saco de X kg") e preço POR PACOTE; o total em R$ e o total
creditado no depósito são derivados e exibidos (`loja-summary-{id}`). Comprar
grava a compra REAL em `/api/purchases` (categoria financeira correta por
item) **+ a linha de item da nota** em `POST /api/purchases/:id/items`
(descrição, quantidade em `purchaseUnit` BAG/UNIT/BOX…, preço unitário e
total — /compras mostra os "Itens" certinhos, `itemsDifference` 0) e, para
itens `stockable` (sementes, adubo, ração, sal), garante o item no catálogo
(`/api/feed-items`, match por nome) e credita o Depósito com pacotes × tamanho
via `/api/feed-purchase-entries` — a economia do HUD reflete na hora porque a
compra é real. Itens não estocáveis (remédio, diesel, manutenção) geram só o
fato financeiro (compra + linha de item). Folha `game-loja-sheet`; som `buy`.

## Plantação (PLANTACAO)

O talhão de roça: **plantar gasta insumos DO DEPÓSITO** (linhas
`feedItemId + quantidade` com o mesmo `FeedLinesEditor` do trato e saldo por
linha; ao menos uma — ex.: sementes; o consumo DEBITA o saldo derivado, e uso
além do saldo pede confirmação — 409 `BEYOND_BALANCE`, padrão do trato), o
**ciclo corre no relógio** (duração configurável em minutos/horas/dias, salva
como `duration_hours`) e a **colheita registra o que saiu**, mostrando de
volta o que foi investido ("você gastou X → colheu Y"). Sem estoque, a folha
aponta para a Loja (`planting-no-stock`). `planting_inputs.feed_item_id`
referencia o catálogo; nome/unidade ficam como snapshot para o recibo.

- Dados: `plantings` + `planting_inputs` (migração `0016_plantings.sql`); só
  um plantio `GROWING` por instalação (índice parcial). Progresso NUNCA é
  armazenado — deriva de `planted_at + duration_hours`
  (`src/domain/game/planting.ts`, compartilhado servidor/cliente; limiares
  SPROUT < 0.25 ≤ GROWING < 0.6 ≤ MATURE < 1 ≤ READY).
- Endpoints: `GET/POST /api/plantings`, `POST /api/plantings/:id/harvest`
  (servidor recusa antes de READY — `PLANTING_NOT_READY`),
  `POST /api/plantings/:id/cancel`. O plantio ativo viaja em
  `/api/game/state.planting`.
- Tabuleiro: `PlantacaoSprite` desenha o talhão por estágio (`data-stage`);
  READY fica dourado (`cropRipe`) com o selo "Colher! 🌾". O cliente re-deriva
  o estágio num tick local (5s no mapa, 1s na folha) sem bater no servidor.
- Folha (`game-plantacao-sheet`): formulário de plantio (cultura, duração,
  insumos), acompanhamento (barra `planting-progress` + tempo restante +
  insumos investidos + cancelar) e colheita (`planting-harvest-form`) com o
  "recibo" (`planting-harvest-result`).

## Sprites

- Componentes React SVG em `src/client/features/game/sprites/`, viewBox local
  fixo `0 0 64 64`, sem estado próprio; recebem só props de posição/escala.
- Nomes: `CowSprite`, `MangueiraSprite`, `TankGauge`, `TruckSprite`,
  `TreeSprite`.
- Cores exclusivamente de `gameTokens.colors`.

## CSS

- Todo estilo do jogo em classes `.game-*` num bloco próprio de
  `src/client/styles.css`, com vars `--game-*` definidas em `.game-root`.
- O jogo não usa `.page`/`.section-card`/`.button` dentro do mapa — a UI do
  mundo é própria (`.game-cta`, `.game-hud-chip`, `.game-sheet`). Formulários
  reutilizados (ex.: `DailyMilkTotalForm`) mantêm o estilo padrão do app dentro
  da folha, o que é aceitável: são "papelada real" do sítio.

## Convenções de `data-testid`

| testid | Elemento | Atributos de estado |
|---|---|---|
| `game-root` | Moldura do jogo | — |
| `game-empty` | Convite de configuração | — |
| `game-camera` | `<g>` com pan/zoom | `transform` |
| `game-zone-{id}` | Polígono de zona | — |
| `game-zone-label-{id}` | Rótulo da zona | — |
| `game-fence` | Cerca do perímetro (mourões) | `data-post-count` |
| `game-fence-pasture-{id}` | Cerca clara do pasto | `data-post-count` |
| `herd-cluster-{groupId}` | Cluster de vacas do lote | — |
| `herd-count-{groupId}` | Badge de contagem | — |
| `game-corral` | Curral de não-mapeados | — |
| `game-installation-{kind}` | Instalação (kind minúsculo; `garagem` é decorativa: `role="img"`, sem ações) | — |
| `game-deposito-sheet` | Folha do Depósito (inventário de alimentação) | — |
| `feed-inventory-list` / `feed-inventory-item-{id}` / `feed-inventory-balance-{id}` | Lista de saldo derivado por item | — |
| `game-estacao-sheet` | Folha da Estação de Alimentação (trato STATION) | — |
| `feeding-event-form` / `feed-line-{n}` / `feed-line-balance-{n}` | Formulário de trato e linhas item+quantidade | — |
| `feeding-confirm-beyond` | Botão de confirmação de uso além do saldo | — |
| `game-tank` | Medidor do tanque | `data-level` (0–1) |
| `game-truck` | Caminhão do laticínio | `data-state` (`idle`/`driving`) |
| `game-audio-toggle` | Botão de mudo do jogo | `data-muted` |
| `game-plantacao-sheet` | Folha da Plantação | — |
| `planting-form` / `planting-input-line-{n}` | Formulário de plantio e linhas de insumo | — |
| `planting-growing` / `planting-progress` | Acompanhamento do ciclo | `aria-valuenow` (%) |
| `planting-harvest-form` / `planting-harvest-result` | Colheita e recibo (gasto → colhido) | — |
| `planting-inputs` | Lista de insumos investidos | — |
| `planting-no-stock` / `planting-confirm-beyond` | Aviso de depósito vazio / confirmação além do saldo | — |
| `game-loja-chip` | Chip da Loja no HUD | — |
| `game-loja-sheet` / `loja-items` / `loja-item-{id}` / `loja-buy-{id}` | Folha da Loja, vitrine e compra | — |
| `deposito-open-loja` | Ação "Comprar na Loja" no Depósito | — |
| `hud-economy` | Chip de economia | — |
| `hud-streak` | Chip de streak | — |
| `editor-map` | Container do Leaflet | — |
| `editor-location` | Passo de localização | — |
| `editor-finish` | Botão de fechar polígono | — |
| `game-action-sheet` | Folha de ações da mangueira | — |
| `game-group-sheet` | Folha do LOTE (abre no clique do `herd-cluster-*`) | — |
| `game-group-animals` | Lista de animais dentro da folha do lote | — |
| `game-group-animal-{id}` | Linha de animal na folha do lote | — |
| `game-group-animal-actions` | Ações rápidas do animal selecionado | — |

## Layout do HUD (respeita o mic-fab do app no canto inferior direito)

- Curral (`game-corral`): topo esquerdo. Streak (`hud-streak`): topo direito.
- Economia (`hud-economy`): base esquerda. Chip "Mapa" (editar): acima da economia.
- Controles de zoom: coluna à direita, ACIMA do mic-fab (`.game-zoom-controls`).
- O canto inferior direito pertence ao mic-fab global — nada do jogo ali.

## Receita: adicionar uma instalação nova (ex.: Depósito)

1. **Enum:** adicionar valor em `map_installation_kind` (`src/db/schema.ts`) se
   ainda não existir; migração escrita À MÃO (`pnpm db:generate` gera
   full-schema inválido — padrão `drizzle/0014_feeding_inventory.sql` +
   entrada em `drizzle/meta/_journal.json`).
2. **Sprite:** criar `XSprite.tsx` em `sprites/` (viewBox 64, tokens).
3. **Layer:** mapear o kind → sprite em `layers/InstallationLayer.tsx`
   (`ACTIONABLE_KINDS` decide se vira botão ou decoração `role="img"`).
4. **Editor:** acrescentar o kind em `INSTALLATION_LABELS`/passo 4 do editor
   (`GameMapEditorPage`).
5. **Folha de ações:** criar uma folha própria montada sobre `GameSheet`
   (ex.: `GameDepositoSheet`) — cada ação grava fato real via endpoint
   existente (regra de ouro) — e abrir por kind no `GamePage`.
6. **Testes:** `data-testid="game-installation-<kind minúsculo>"`, e2e
   clicando e validando a folha; screenshot no visual spec. Instalações da
   fixture e2e ficam em `createGameMapFixture` (helpers.ts).

Instalações atuais: MANGUEIRA (produção/coleta/trato da ordenha), DEPOSITO
(inventário de insumos: compra real pela Loja credita, trato E plantio
debitam, saldo sempre derivado), ESTACAO_ALIMENTACAO (trato STATION com saldo
por linha), PLANTACAO
(plantio com insumos → crescimento por relógio → colheita; seção "Plantação"),
GARAGEM (decorativa), CASA (enum reservado, ainda sem sprite).

## Testes

- Determinismo: layout de rebanho por hash estável do `groupId`; datas sempre do
  servidor (`state.today.date`); sem `Math.random` no domínio do jogo.
- Fixture e2e: `createGameMapFixture(page)` em `tests/e2e/helpers.ts` cria
  perímetro/pasto/mangueira via API (independente do editor).
- Visual: `capturePaintedViewport` com `animations: 'disabled'`.
- Guarda de performance: < 1500 nós SVG sob `game-root` (clusters capados em 8
  sprites + badge `+N`).
