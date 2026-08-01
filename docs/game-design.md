# Design do jogo — "Tabuleiro do Sítio" (/, a home do app)

Fonte única de verdade do design da camada de jogo. Toda convenção nova criada
durante a implementação DEVE ser registrada aqui. Referências de arte escolhidas
pelo usuário: **Mini Motorways/Mini Metro** (paleta enxuta, iconografia, limpeza
de UI), **Dorfromantik** (linguagem pastoral de campos, pastel calmo),
**ISLANDERS** (feel de posicionamento, HUD discreto).

## O jogo é a home (fase 6)

Desde a fase 6, `/` renderiza o jogo (`/jogo` virou redirect para `/`). Fora do
tabuleiro só ficam **gráficos e auditoria**, no hub `/graficos` (links para
produção mensal, evolução de peso, financeiro mensal, documentos, exportação
CSV e as listas de auditoria — controles, pesagens, compras, receitas,
mastite). As páginas clássicas de listagem/detalhe continuam existindo para
consulta e correção, alcançadas pelos links sutis das folhas/caderno e pelo
hub. O menu do `AppShell` é mínimo: **Mapa** (`/`), **Caderno**
(`/?caderno=1` — abre o caderno por parâmetro de URL, sem rota própria;
`?caderno=<slug>` abre numa aba específica) e **Gráficos** (`/graficos`). O
assistente não é item de menu: o MicFab global abre a CaptureSheet em qualquer
tela. O antigo dashboard virou a **aba Hoje** do Caderno (`TodayPanel` em
`features/dashboard/`, busca `/api/dashboard` sozinho) e `/revisar` virou
redirect para `/?caderno=pendencias`.

## Regra de ouro

O jogo é uma lente sobre dados reais. **Toda ação do jogo grava um fato real
pelos endpoints validados existentes** (`/api/daily-milk-totals`,
`/api/milk-collections`, `/api/milk-sessions`, …). Zero moeda fictícia, zero
simulação, zero endpoint de escrita próprio para fatos de fazenda. Streaks e
economia são sempre derivados, nunca armazenados.

Pasto e mapa são a mesma entidade (decisão 2026-07-20): toda zona PASTURE
vincula um pasto real — sem vínculo escolhido, o editor cria o pasto pelo
`POST /api/pastures` antes de salvar a zona, e pastos sem desenho ganham o
traçado pelo deep-link `/jogo/mapa/editor?pasto=<id>`. Desde a fase 3, a
página `/pastos` virou redirect para o jogo (hoje `/`): a superfície do pasto
é a folha dele no tabuleiro (seção "Pastos no tabuleiro"). A
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
  `pointInPolygon`). O código `PASTURE_OUTSIDE_PERIMETER` vale para qualquer
  zona interna (pasto ou talhão); a mensagem explica na UI do editor.
- **Folhas de instalação:** AÇÕES sempre em cima; listagens (estoque, animais)
  vêm depois.

## Modelo de mundo (fase 2): terra, construções e porteira

O mapa modela três tipos de coisa, como numa fazenda de verdade:

1. **Terra (polígonos em `map_zones`):** `PERIMETER`, `PASTURE` e `PLOT`
   (talhão/roça, novo na migração `0020_farm_world.sql`). **PLANTACAO deixou
   de ser instalação-ponto e virou zona de terra desenhada**: a migração
   converte cada instalação PLANTACAO existente numa zona PLOT (anel pequeno
   em volta do ponto, nome preservado) e religa os plantios — `plantings`
   agora referencia a zona (`zone_id`, FK com cascade; a FK antiga para
   `map_installations` cai ANTES da conversão para o cascade não apagar os
   plantios). Um ciclo GROWING por talhão (índice parcial em `zone_id`).
   Talhão com plantio crescendo não pode ser excluído (`PLOT_HAS_GROWING`);
   com plantios encerrados, a exclusão DESATIVA a zona (histórico é fato de
   fazenda, nunca apagado em cascata); sem plantios, exclui de verdade.
2. **Construções (pontos com função em `map_installations`):** MANGUEIRA
   (ordenha + tanque), DEPOSITO, CASA (escritório — folha própria),
   ESTACAO_ALIMENTACAO (**Cocho**: valor do enum preservado, só os rótulos
   mudaram), GARAGEM (abre a Loja na prateleira de combustível/manutenção),
   BALANCA e ENFERMARIA (folhas reais desde a fase 4 — seção "Demais
   entidades no kit").
   **Multi-instância:** COCHO, BALANCA e ENFERMARIA podem se repetir — o
   `name` diferencia as instâncias e aparece como rótulo no mapa
   (`.game-installation-label`); a unicidade por kind virou índice parcial só
   para os singletons (`map_installations_singleton_kind_unique`).
3. **PORTEIRA (novo kind):** por onde tudo entra e sai. O caminhão da coleta
   passa por ela (a rota do `game-truck` usa a altura da porteira quando ela
   existe), a Loja abre TAMBÉM por ela (o chip no HUD continua) e o marcador
   "coleta de hoje não registrada" mora nela.

### Registro declarativo (`installations.registry.ts`)

Cada kind declara `{ label, hint, sprite, spriteSize, actionable,
multiInstance, sheet, withTank? }`. O `InstallationLayer` e o editor leem o
registro — **não existe mais switch por kind**. `sheet` é uma chave
(`InstallationSheetKey`) que a `GamePage` resolve para o componente de folha
(`mangueira`, `deposito`, `cocho`, `loja`, `lojaCombustivel`, `casa`,
`balanca`, `enfermaria`). Instalação nova = sprite + folha + 1 entrada no
registro (+ kind no enum, com migration à mão).

### Marcadores no mundo

`GET /api/game/state` devolve `markers: Array<{ kind, targetType, targetId,
label, rule }>` — pendências DERIVADAS (nada é armazenado): `COLLECTION_MISSING`
→ porteira (sem coleta hoje), `PLANTING_READY` → talhão do plantio pronto,
`PURCHASE_OVERDUE` → casa (compra OPEN vencida). O `MarkerLayer` posiciona o
marcador na instalação ou no centroide da zona e mostra SEMPRE a regra
(`rule`) no texto; tocar abre a folha correspondente (coleta → mangueira,
colheita → talhão, conta → casa). O estado também trocou `planting` (único)
por `plantings` (um por talhão).

### Editor: PATCH vivos

O editor ativou os PATCH que estavam mortos: **retraçar** uma zona (pasto ou
talhão) usa `PATCH /api/game/map/zones/:id` com o novo anel — o vínculo é
mantido e o servidor recalcula `area_ha` do pasto via
`syncPastureAreaFromRing()`; **mover** uma instalação usa
`PATCH /api/game/map/installations/:id` (modo "mover": selecionar → clicar no
novo ponto). O editor também desenha **PLOT** (passo 3, "Talhões"). Falhas de
contenção do servidor aparecem como mensagem clara no `ErrorState` do editor.
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
  liga tudo enquanto o jogo (`/`) está montado. Nada de `new Audio` solto em
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
  `harvest`; compra na Loja `buy`; confirmações genéricas `success`; trocar de
  aba no Caderno `pageTurn`.
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

## Plantação (zonas PLOT — talhões)

Cada talhão desenhado no mapa é uma zona `PLOT` com seu próprio ciclo:
**plantar gasta insumos DO DEPÓSITO** (linhas
`feedItemId + quantidade` com o mesmo `FeedLinesEditor` do trato e saldo por
linha; ao menos uma — ex.: sementes; o consumo DEBITA o saldo derivado, e uso
além do saldo pede confirmação — 409 `BEYOND_BALANCE`, padrão do trato), o
**ciclo corre no relógio** (duração configurável em minutos/horas/dias, salva
como `duration_hours`) e a **colheita registra o que saiu**, mostrando de
volta o que foi investido ("você gastou X → colheu Y"). Sem estoque, a folha
aponta para a Loja (`planting-no-stock`). `planting_inputs.feed_item_id`
referencia o catálogo; nome/unidade ficam como snapshot para o recibo.

- Dados: `plantings` + `planting_inputs` (migração `0016_plantings.sql`;
  `zone_id` desde `0020_farm_world.sql`); só um plantio `GROWING` por talhão
  (índice parcial). Progresso NUNCA é armazenado — deriva de
  `planted_at + duration_hours`
  (`src/domain/game/planting.ts`, compartilhado servidor/cliente; limiares
  SPROUT < 0.25 ≤ GROWING < 0.6 ≤ MATURE < 1 ≤ READY).
- Endpoints: `GET/POST /api/plantings` (POST leva `zoneId` do talhão),
  `POST /api/plantings/:id/harvest`
  (servidor recusa antes de READY — `PLANTING_NOT_READY`),
  `POST /api/plantings/:id/cancel`. Os plantios ativos viajam em
  `/api/game/state.plantings` (um por talhão).
- Tabuleiro: a zona PLOT tinge pelo estágio (terra → `crop` → dourado
  `cropRipe` quando READY, com o selo "Colher! 🌾" `game-plot-ready-{zoneId}`)
  e é clicável — abre a folha do ciclo daquele talhão. O cliente re-deriva o
  estágio num tick local (5s no mapa, 1s na folha) sem bater no servidor.
- Folha (`game-plantacao-sheet`): formulário de plantio (cultura, duração,
  insumos), acompanhamento (barra `planting-progress` + tempo restante +
  insumos investidos + cancelar) e colheita (`planting-harvest-form`) com o
  "recibo" (`planting-harvest-result`). O subtítulo sempre diz qual talhão
  está em foco.

## Pastos no tabuleiro (fase 3)

O pasto é entidade do jogo de ponta a ponta — a página `/pastos` morreu
(redirect para o jogo) e o "Mover pasto" da página do lote aponta para o
mapa:

- **Folha do pasto** (`game-pasture-sheet`, sobre `GameEntitySheet`): abre ao
  tocar na área VAZIA de uma zona PASTURE (o toque no rebanho continua
  abrindo a folha do lote — o cluster fica numa camada acima do polígono
  clicável). Conteúdo: nome, área medida pelo traçado, lote atual com dias de
  uso, descanso derivado (tudo vem de `GET /api/pastures`, derivado no
  servidor) e o histórico de rotação (`game-pasture-history`). Ações:
  mover lote, renomear (`PATCH /api/pastures/:id`, que já propaga o nome para
  a zona), redesenhar (deep-link `?retraco=<zoneId>` do editor) e subdividir.
- **Rotação com confirmação explícita (decisão do usuário, inviolável):**
  mover rebanho entre pastos NUNCA acontece por acidente nem num toque. A
  folha oferece "Trazer lote para cá" (pasto livre → lista de lotes) ou
  "Mover este lote" (pasto ocupado → pastos livres + "Sem pasto (retirar)"),
  sempre seguidos do passo de confirmação (`game-pasture-move-confirm`) que
  descreve a consequência em linguagem clara ("Lote 1 sai do Pasto A e vai
  para o Pasto B hoje, DD/MM. A ocupação do Pasto A é encerrada e o descanso
  começa a contar."). Só o botão Confirmar chama
  `POST /api/herd-groups/:id/pasture`; os erros do servidor (pasto ocupado,
  data inválida) aparecem na folha. Sem drag-and-drop.
- **Subdivisão guiada:** "Subdividir" leva ao editor pelo deep-link
  `?subdividir=<zoneId>`. O usuário desenha os novos anéis sequencialmente
  (cada "Fechar área" acumula; `editor-subdivide-rings` mostra a prévia dos
  nomes `X.a`, `X.b`… com a área medida) e conclui com
  `editor-subdivide-finish` (mínimo 2, máximo 8). O servidor
  (`POST /api/pastures/:id/subdivide`) valida contenção no perímetro e, numa
  única transação, desativa o pasto original + sua zona e cria os novos
  pastos (área medida por `ringAreaHa`) cada um com sua zona PASTURE — a
  linhagem fica no nome (`subdivisionName` em `src/domain/pastures.ts`), sem
  hierarquia. Pasto ocupado não pode ser desativado (409 `PASTURE_OCCUPIED`):
  o editor explica e aponta para a rotação com confirmação no jogo.
- **Controle individual na mangueira:** a folha da mangueira ganhou o fluxo
  vaca a vaca (`game-individual-control`): a fila é a mesma do formulário
  manual (`GET /api/milking-herd?date=` — vacas LACTATING em lote de ordenha
  na data), uma vaca por vez com campo grande de litros manhã/tarde e avanço
  automático ao concluir os períodos dela (voltar/avançar manual também
  existe). Grava no mesmo `POST /api/milk-sessions`
  (`SEPARATE_MORNING_AFTERNOON`, CONFIRMED) e trata `SESSION_DATE_EXISTS` com
  o mesmo cartão de conflito do app. Lote só de manhã mantém tarde vazia.
- **Animal completo no kit:** o detalhe do animal (GameGroupSheet e Caderno)
  ganhou "Mover de lote" (`AnimalGroupChangeForm`) e o cadastro individual
  (`AnimalForm`, extraído de `AnimalsPage` para `features/animals`) no modo
  create — pela folha do lote (`game-group-create-animal`) e pelo menu "+" do
  Caderno (`game-notebook-create-animal`). "Desfazer última situação" ficou
  de fora: o `AnimalStatusChangeForm` não suporta desfazer (só a ficha do
  animal no app).
- **Lote como entidade:** a aba Rebanho do Caderno lista os lotes com
  criar/editar/arquivar (`HerdGroupForm` ganhou modo edição; arquivar =
  `PATCH active:false`). Arquivar lote com animais mostra o 409 do servidor
  (`GROUP_HAS_ANIMALS`) na própria folha.

## Sprites

- Componentes React SVG em `src/client/features/game/sprites/`, viewBox local
  fixo `0 0 64 64`, sem estado próprio; recebem só props de posição/escala.
- Nomes: `CowSprite`, `MangueiraSprite`, `TankGauge`, `TruckSprite`,
  `TreeSprite`, `DepositoSprite`, `EstacaoAlimentacaoSprite` (Cocho),
  `GaragemSprite`, `CasaSprite`, `BalancaSprite`, `EnfermariaSprite`,
  `PorteiraSprite`, `LojaSprite`, `PlantacaoSprite` (cabeçalho da folha).
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
| `game-installation-{kind}` | Instalação (kind minúsculo; tudo é acionável desde a fase 2 — ver registro) | — |
| `game-marker-{kind}` | Marcador de pendência no mundo (`collection-missing`, `planting-ready`, `purchase-overdue`) | — |
| `game-plot-ready-{zoneId}` | Selo "Colher! 🌾" no talhão pronto | — |
| `game-casa-sheet` / `game-balanca-sheet` / `game-enfermaria-sheet` | Folhas reais da Casa (escritório), Balança (pesagem) e Enfermaria (saúde) — conteúdo na seção "Demais entidades no kit" | — |
| `game-deposito-sheet` | Folha do Depósito (inventário de alimentação) | — |
| `feed-inventory-list` / `feed-inventory-item-{id}` / `feed-inventory-balance-{id}` | Lista de saldo derivado por item (tocar abre o editor do catálogo) | — |
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
| `editor-zone-retrace-{id}` | Ação "Retraçar" de uma zona (PATCH do anel) | — |
| `editor-installation-move-{id}` | Ação "Mover" de uma instalação (PATCH da posição) | — |
| `editor-plot-save` | Salvar o talhão (PLOT) desenhado | — |
| `game-action-sheet` | Folha de ações da mangueira | — |
| `game-group-sheet` | Folha do LOTE (abre no clique do `herd-cluster-*`) | — |
| `game-group-animals` | Lista de animais dentro da folha do lote | — |
| `game-group-animal-{id}` | Linha de animal na folha do lote | — |
| `game-group-animal-actions` | Ações rápidas do animal selecionado | — |
| `game-entity-sheet` | Moldura padrão do `GameEntitySheet` (testid real vem da prop) | — |
| `game-notebook` | Caderno do sítio (folha grande com abas e busca) | — |
| `game-notebook-tab-{slug}` | Abas do Caderno (`hoje`, `rebanho`, `producao`, `estoque`, `financeiro`, `saude`, `pendencias`) | `data-active` |
| `game-notebook-search` | Busca global do Caderno | — |
| `game-notebook-item-{tipo}-{id}` | Linha-cartão de uma entidade no Caderno | — |
| `game-notebook-detail` | Detalhe da entidade dentro do Caderno | — |
| `game-notebook-animal-actions` | Ações rápidas no detalhe de animal do Caderno | — |
| `game-notebook-create` / `game-notebook-create-{slug}` | Menu de criação global (`producao`, `coleta`, `trato`, `compra`, `plantio`) | — |
| `game-notebook-producao-actions` / `game-notebook-producao-action-{total,coleta,individual}` | Cartões de ação no topo da aba Produção (abrem a mangueira na sub-view) | — |
| `game-notebook-producao-filter-{slug}` | Chips de filtro da aba Produção (`todos`, `totais`, `controles`, `coletas`) | `data-active` |
| `game-notebook-estoque-filter-{slug}` / `game-notebook-financeiro-filter-{slug}` / `game-notebook-saude-filter-{slug}` / `game-notebook-rebanho-filter-{slug}` | Chips de filtro das demais abas (Estoque: `todos`/`em-falta`/`inativos`; Financeiro: `todos`/`a-pagar`/`a-receber`/`pagas`; Saúde: `todos`/`abertos`/`encerrados`; Rebanho: `todos`/id do lote) | `data-active` |
| `hud-caderno` | Chip "Caderno" no HUD (coluna esquerda, acima do "Mapa") | — |
| `hud-pending` | Chip de pendências de revisão no HUD (só quando > 0) | — |
| `game-create-menu` | Botão "+" de criação global no HUD | — |
| `game-pasture-sheet` | Folha do pasto (abre no toque da área vazia da zona PASTURE) | — |
| `game-pasture-move-pick` / `game-pasture-move-confirm` | Escolha do destino e passo de confirmação da rotação | — |
| `game-pasture-bring` / `game-pasture-retrace` / `game-pasture-subdivide` | Ações "Trazer lote para cá", redesenhar e subdividir | — |
| `game-pasture-history` | Histórico de rotação na folha do pasto | — |
| `game-group-create-animal` | Ação "Cadastrar animal" na folha do lote | — |
| `game-action-individual` | Ação "Controle individual" na folha da mangueira | — |
| `game-individual-control` / `game-individual-progress` | Fluxo vaca a vaca e progresso da fila | — |
| `game-individual-prev` / `game-individual-next` / `game-individual-save` | Navegação da fila e gravação do controle | — |
| `game-notebook-group-create` / `game-notebook-group-edit` / `game-notebook-group-archive` | Lote como entidade no Caderno (criar/editar/arquivar) | — |
| `editor-subdivide-rings` / `editor-subdivide-finish` | Anéis acumulados e conclusão da subdivisão no editor | — |
| `game-balanca-new` / `game-balanca-session-{id}` | Ação "Nova pesagem" e sessões recentes na folha da balança | — |
| `game-weighing-queue` / `game-weighing-progress` | Fila de pesagem vaca a vaca e progresso | — |
| `game-weighing-prev` / `game-weighing-next` / `game-weighing-save` | Navegação da fila e gravação da sessão de pesagem | — |
| `game-enfermaria-new` / `game-enfermaria-case-{id}` / `game-enfermaria-edit` | Ação "Registrar mastite", casos em aberto e edição do caso na enfermaria | — |
| `game-casa-new-purchase` / `game-casa-new-revenue` / `game-casa-milk-price` / `game-casa-new-supplier` | Ações do escritório (compra, receita, preço do leite, fornecedor) | — |
| `game-casa-purchase-{id}` / `game-casa-revenue-{id}` | Pendências "A pagar"/"A receber" na casa (abrem o fato com anexos) | — |
| `game-notebook-animal-mastite` / `game-group-animal-mastite` | Ação "Registrar mastite" no detalhe do animal (caderno e folha do lote) | — |
| `game-notebook-feeditem-create` | Ação "Novo item do catálogo" na aba Estoque do caderno | — |
| `game-notebook-pending-marker-{kind}` | Pendência derivada do mundo na aba Pendências (`collection-missing`, `purchase-overdue`, `planting-ready`) | — |
| `game-sheet-review-badge` / `game-sheet-review-dismiss` | Aviso "Vindo do assistente" no modo revisão da folha e botão Descartar | — |
| `game-individual-review` | Revisão linha a linha do controle individual por IA na mangueira | — |
| `import-bulk-register` / `import-bulk-panel` / `import-bulk-line-{i}` / `import-bulk-confirm` | Cadastro em massa das linhas sem vínculo na revisão do controle (um lote para todas, rematch automático) | — |
| `game-weighing-review` / `game-weighing-review-row-{i}` / `game-weighing-review-save` | Revisão da pesagem por IA na balança (revalidada pelo `/api/weight-sessions/validate`) | — |
| `game-weighing-bulk-register` / `game-weighing-bulk-panel` / `game-weighing-bulk-line-{i}` / `game-weighing-bulk-confirm` | Cadastro em massa das linhas sem vínculo na revisão da pesagem | — |
| `game-notebook-review-open` / `game-notebook-review-dismiss` | Ações "Revisar na folha" e "Descartar captura" no detalhe de pendência do caderno | — |
| `graficos-hub` | Página-hub `/graficos` (gráficos + registros e auditoria fora do jogo) | — |
| `capture-recording-timer` / `capture-recording-warning` | Contagem regressiva do limite de 60s e aviso final no gravador do assistente | — |

## Layout do HUD (respeita o mic-fab do app no canto inferior direito)

- Curral (`game-corral`): topo esquerdo. Streak (`hud-streak`): topo direito.
- Economia (`hud-economy`): base esquerda. Chip "Mapa" (editar): acima da economia.
- Chip "Caderno" (`hud-caderno`): acima do "Mapa"; chip "Loja" (`game-loja-chip`): acima do Caderno.
- Topo direito em coluna: streak → som (`game-audio-toggle`) → botão "+" de criação global (`game-create-menu`) → chip de pendências (`hud-pending`, só quando há ações aguardando revisão em `/api/captures` — mesma contagem da aba Pendências do Caderno; abre o Caderno nessa aba).
- Controles de zoom: coluna à direita, ACIMA do mic-fab (`.game-zoom-controls`).
- O canto inferior direito pertence ao mic-fab global — nada do jogo ali.

## Game UI kit (fase 1 da plataforma central)

Toda visualização/criação/edição de entidade do jogo acontece em folhas
padronizadas — nunca uma moldura nova por entidade.

- **`GameEntitySheet`** (`features/game/GameEntitySheet.tsx`): scaffold padrão
  de entidade sobre o `GameSheet`. Padroniza moldura + cabeçalho (sprite,
  título, subtítulo) + slot de badge de situação (`StatusBadge` + descritores
  de `lib/status.ts`) + AÇÕES SEMPRE EM CIMA via prop `actions`
  (`{ icon, label, hint?, onClick, testid? }`, renderizadas por
  `GameEntityActions` como `.game-sheet-action`). NÃO é máquina de estado
  view/edit/create: quem usa controla as sub-views (como a `GameGroupSheet`
  com 'menu'|'heat'|'status'). `data-testid` da moldura vem da prop `testid`
  (padrão `game-entity-sheet`); a área de ações é `${testid}-actions`
  (sobrescrevível por `actionsTestid` para preservar testid legado).
  `GameSheet` ganhou os slots opcionais `badge` (no cabeçalho) e `className`
  (na moldura). `GameGroupSheet`, `GameDepositoSheet` e `GameEstacaoSheet`
  estão migradas; `GameLojaSheet`/`GamePlantacaoSheet` seguem custom.
- **Caderno (`GameNotebook`)**: folha grande (`.game-notebook`) com cara de
  caderno de papel — abas-orelha (`.game-notebook-tab`), busca global no topo
  (`game-notebook-search`) e listas de cartões-linha no estilo
  `.game-sheet-action` (título forte + linha secundária + `StatusBadge`,
  nunca tabela densa). Dimensionamento: mobile como folha; desktop (≥1024px)
  `min(1100px, 92vw)` × `85dvh` — as regras ficam DEPOIS de `.game-sheet` em
  `styles.css` porque na mesma especificidade a última vence (o `sm:max-w-lg`
  da moldura não pode encolher o caderno). A rolagem é INTERNA: cabeçalho,
  busca e abas ficam fixos (`.game-notebook` é flex-coluna com
  `overflow:hidden`; busca e abas `shrink-0`) e só o conteúdo da aba rola em
  `.game-notebook-scroll` — nada encavala por cima do cabeçalho. Abas: Hoje,
  Rebanho, Produção, Estoque, Financeiro, Saúde, Pendências — cada uma carrega
  seus endpoints de listagem EXISTENTES sob demanda (`useLazyResource` local;
  `/api/animals`, `/api/daily-milk-totals`, `/api/milk-sessions`,
  `/api/milk-collections`, `/api/feed-inventory`, `/api/purchases`,
  `/api/revenues`, `/api/mastitis-cases`, `/api/captures`). Trocar de aba toca
  o som `pageTurn`. **AÇÕES sempre em cima**: a aba Produção abre com os
  cartões de ação (`game-notebook-producao-action-{total,coleta,individual}`)
  que abrem a folha da mangueira JÁ na sub-view (`initialView` da
  `GameActionSheet`, pedida pelo alvo `MANGUEIRA_PRODUCAO`/`_COLETA`/
  `_INDIVIDUAL` do `onOpenInstallation`) — sem duplicar formulários. Abaixo
  das ações, a lista unificada (totais + controles + coletas) agrupada por
  data com chips de filtro client-side (`game-notebook-producao-filter-*`;
  mesmo padrão nas demais abas longas: Estoque `todos|em-falta|inativos`,
  Financeiro `todos|a-pagar|a-receber|pagas`, Saúde `todos|abertos|encerrados`
  e Rebanho por lote quando há 2+ lotes ativos — componente `FilterChips`,
  classe `.game-notebook-filter`, sem endpoints novos). A busca global atua
  por cima dos filtros (substitui a view de abas ao digitar).
  Desde a fase 6 há também a aba **Hoje** (primeira; padrão ao abrir), que
  monta o `TodayPanel` (`features/dashboard/`) — o conteúdo do antigo
  dashboard, buscando `/api/dashboard` diretamente. A busca é client-side com `normalizeLabel` sobre os dados carregados (ao
  digitar, todas as fontes carregam) e agrupa resultados por tipo. O detalhe
  da entidade abre DENTRO do caderno (sub-view, não folha empilhada — evita
  focus traps aninhados), via mapa declarativo tipo → renderer
  (`describeDetail`): animal traz as ações rápidas da `GameGroupSheet`
  (`ReproductiveEventForm`/`AnimalStatusChangeForm`/`AnimalGroupChangeForm` +
  "Registrar mastite") + link da ficha; lote e item do catálogo são entidades
  editáveis (fases 3 e 4); demais entidades são view somente-leitura com link
  sutil para a página do app (transicional — fases seguintes trazem edição). O menu de criação global
  (botão "+" do HUD) é uma view do Caderno que só abre as folhas já
  existentes (mangueira, estação, loja, plantação) — nenhum formulário novo.

## Receita: adicionar uma instalação nova (ex.: Depósito)

1. **Enum:** adicionar valor em `map_installation_kind` (`src/db/schema.ts`) se
   ainda não existir; migração escrita À MÃO (`pnpm db:generate` gera
   full-schema inválido — padrão `drizzle/0014_feeding_inventory.sql` +
   entrada em `drizzle/meta/_journal.json`; enums novos/recriados na mesma
   migration: o migrador roda cada arquivo numa transação, então
   `ALTER TYPE ... ADD VALUE` não pode ser usado — recrie o tipo, padrão
   `drizzle/0020_farm_world.sql`).
2. **Sprite:** criar `XSprite.tsx` em `sprites/` (viewBox 64, tokens).
3. **Registro:** uma entrada em `installations.registry.ts`
   (`INSTALLATION_REGISTRY`) com label, hint, sprite, `actionable`,
   `multiInstance` e a chave da folha. O `InstallationLayer` e o passo de
   instalações do editor (`GameMapEditorPage`) leem o registro sozinhos.
4. **Folha de ações:** criar uma folha própria montada sobre `GameSheet`
   (ex.: `GameDepositoSheet`) — cada ação grava fato real via endpoint
   existente (regra de ouro) — e mapear a chave → componente na `GamePage`.
5. **Testes:** `data-testid="game-installation-<kind minúsculo>"`, e2e
   clicando e validando a folha; screenshot no visual spec. Instalações da
   fixture e2e ficam em `createGameMapFixture` (helpers.ts).

Instalações atuais: MANGUEIRA (produção/coleta/trato da ordenha), DEPOSITO
(inventário de insumos: compra real pela Loja credita, trato E plantio
debitam, saldo sempre derivado; item do catálogo editável/reativável na
própria folha), ESTACAO_ALIMENTACAO → **Cocho** (trato
STATION com saldo por linha; multi-instância), GARAGEM (abre a Loja em
combustível/manutenção), CASA (escritório — seção "Demais entidades no kit"),
BALANCA e ENFERMARIA (multi-instância, folhas reais desde a fase 4),
PORTEIRA (Loja + rota do caminhão + marcador de coleta). Terra de roça é zona
PLOT (seção "Plantação"), não instalação.

## Demais entidades no kit (fase 4)

As folhas placeholder viraram fluxos reais, sempre gravando pelos endpoints
existentes e montadas sobre `GameEntitySheet`:

- **Balança (`game-balanca-sheet`):** a sessão de pesagem é uma FILA vaca a
  vaca (`WeighingQueueFlow`, mesmo padrão do controle individual da
  mangueira): todos os animais vivos, um por vez, campo grande de kg, avanço
  automático ao peso válido e pular livre — **sessão parcial permitida** (só
  quem passou na balança entra; peso é medição pontual, nunca interpolada).
  Grava em `POST /api/weight-sessions` (CONFIRMED/HIGH, guardrails de faixa).
  As últimas sessões abrem a página de detalhe do app (`/pesos/:id`), onde a
  correção linha a linha continua.
- **Enfermaria (`game-enfermaria-sheet`):** lista os casos de mastite em
  aberto com a carência derivada (dias restantes/atraso do servidor — nunca
  afirma que o leite foi liberado), registra caso novo pelo formulário real
  de observação (`MastitisCaseForm`, extraído para `features/health`) e abre
  o detalhe do caso com ações programadas/concluídas (`MastitisActions`),
  carência (`WithdrawalNotice`) e desfecho pela edição do caso. O detalhe do
  animal no caderno e na folha do lote ganhou a ação "Registrar mastite"
  (formulário com o animal pré-selecionado).
- **Casa (`game-casa-sheet`):** o escritório. Pendências derivadas dos
  endpoints reais — "A pagar" (compras OPEN, vencidas destacadas) e "A
  receber" (receitas EXPECTED) — e os formulários reais extraídos para
  `features/finance`: compra genérica (`PurchaseForm`), receita
  (`RevenueForm`), preço do leite do mês (`MilkPriceForm`) e cadastro rápido
  de fornecedor (`SupplierForm`). Tocar numa pendência abre o fato dentro da
  folha com o `AttachmentPanel` real (foto → `attachments`), o mesmo do app.
- **Catálogo no depósito e no caderno:** o item virou entidade editável
  (`CatalogItemEditor`, extraído para `features/feeding`): renomear,
  desativar/reativar; a unidade de controle fica travada após a primeira
  movimentação (o 409 do servidor aparece no editor). A aba Estoque do
  caderno lista também os inativos e cria item novo
  (`game-notebook-feeditem-create`).
- **Pendências unificadas:** a aba Pendências do caderno tem três seções —
  "Pendências do sítio" (a MESMA projeção dos marcadores do mundo, lida de
  `/api/game/state`; tocar abre a folha correspondente), "Carências
  informadas" (casos abertos com carência; tocar abre o caso) e "Revisão do
  assistente" (capturas NEEDS_REVIEW — desde a fase 5, tocar abre a folha
  contextual em modo revisão, não mais um card genérico; fala UNKNOWN só dá
  para descartar).

## Revisão pós-IA contextual (fase 5)

A revisão acontece na folha do jogo onde o fato vai viver, **já preenchida** —
confirmar é um toque; corrigir é editar o mesmo formulário de sempre. A
pipeline de `proposed_actions` continua sendo a única porta: nada vira fato
sem revisão humana.

- **Infra (`features/game/review.ts` + `GameReviewNotice.tsx`):**
  `reviewDestination(action)` mapeia o tipo da ação para a folha (produção,
  coleta, controle individual e trato "na ordenha" → mangueira; demais tratos
  → cocho; compra de alimento → depósito; compra/receita → casa; mastite →
  enfermaria; pesagem → balança; UNKNOWN/múltiplas → caderno na aba
  Pendências). O aviso `GameReviewNotice` (`game-sheet-review-badge`) mostra o
  selo "Vindo do assistente", os problemas da interpretação e o Descartar
  (`game-sheet-review-dismiss` — dismiss real da ação).
- **Confirmar = commit da ação proposta:** os formulários reais ganharam as
  props opcionais `reviewInitial` (pré-preenchimento a partir do
  `resolvedPayload`) e `review` (`{ label, onCommit }`); em modo revisão o
  submit chama `POST /api/captures/:captureId/actions/:actionId/commit` com o
  payload revisado em vez de gravar direto (`DailyMilkTotalForm`,
  `QuickCollectionForm`, `FeedingEventForm`, `PurchaseForm`, `RevenueForm`,
  `MastitisCaseForm`). A compra de alimento usa o editor próprio
  (`FeedPurchaseReviewForm`, extraído da antiga /revisar) na folha do depósito.
- **Destino pós-captura:** após o POST /api/captures, uma ação pendente com
  destino óbvio — ou o primeiro controle individual de um lote multiimagem —
  navega para `/` (o jogo) com o estado da revisão
  (`{ reviewCaptureId, reviewActionId }`) e a `GamePage.openReview` abre a
  folha. Ao concluir um controle, a próxima pendência da mesma captura abre
  automaticamente. Ambíguo/não reconhecido cai no caderno na aba Pendências
  (`{ openNotebook: 'pendencias' }`). As folhas passaram a montar mesmo sem
  perímetro traçado — a revisão não depende do mapa.
- **Controle individual por IA:** a revisão linha a linha vive na mangueira
  (`game-individual-review`) pelo `ImportMilkReview` (extraído de
  `ImportMilkPage`, que virou wrapper fino e segue como rota de fallback em
  `/producao/importar`): matching exato, cadastro em massa das linhas sem
  vínculo (`import-bulk-*` — `BulkRegisterFromLabels`, confiança OK marcada e
  baixa confiança desmarcada por padrão, UM lote para todas com default no
  lote mais frequente do controle, POST /api/animals/bulk e rematch
  automático), QuickAnimalForm linha a linha (memoriza o último lote usado na
  revisão), decisões de merge e propostas explícitas de mudança de lote.
  A folha larga usa a ordem compartilhada `FactSequence`: Origem → Contexto
  (data, lote, período) → Medições → Mudanças → Confirmação. Fotos permanecem
  numeradas na ordem do envio e a origem aparece por medição; metadado ausente
  bloqueia a gravação até a escolha humana e nova validação no servidor.
  A gravação é o `POST /api/import/milk-session`, que confirma a ação de
  origem. As 3 telas viraram 1 folha.
- **Pesagem por voz/foto (intent WEIGHT_SESSION):** novo intent de verdade —
  schema em `intents.ts` (linhas animal+kg, peso ilegível = null, nunca
  estimado), prompt em `prompts.ts`, resolução em `resolve.ts`
  (`resolveWeightSession`, matching exato, linhas sem vínculo permitidas) e
  committer em `commit-registry.ts` (cria a sessão pelo novo serviço
  `weight-session.service.ts`, fonte única também do POST
  /api/weight-sessions). A revisão é o `WeighingReviewFlow` na folha da
  balança (`game-weighing-review`): as linhas interpretadas são REVALIDADAS
  pelo `POST /api/weight-sessions/validate` — o endpoint ganhou chamador real
  (decisão: manter, não remover) — e o Confirmar commita o payload revisado.
  Linhas sem vínculo podem virar cadastros em massa (`game-weighing-bulk-*`,
  mesmo `BulkRegisterFromLabels`, com situação escolhível) por confirmação
  humana.
- **/revisar:** na fase 6 virou redirect para `/?caderno=pendencias` — a fila
  de revisão vive na aba Pendências do Caderno, e cada pendência abre a folha
  do fato pelo detalhe (`game-notebook-review-open`). A página e o botão
  `review-open-in-game-{actionId}` deixaram de existir.
- **Limite de 60s visível:** o gravador mostra contagem REGRESSIVA
  (`capture-recording-timer`) e avisa nos últimos 10s
  (`capture-recording-warning`), orientando foto da anotação para controles
  longos.

## Testes

- Determinismo: layout de rebanho por hash estável do `groupId`; datas sempre do
  servidor (`state.today.date`); sem `Math.random` no domínio do jogo.
- Fixture e2e: `createGameMapFixture(page)` em `tests/e2e/helpers.ts` cria
  perímetro/pasto/mangueira via API (independente do editor).
- Visual: `capturePaintedViewport` com `animations: 'disabled'`.
- Guarda de performance: < 1500 nós SVG sob `game-root` (clusters capados em 8
  sprites + badge `+N`).
