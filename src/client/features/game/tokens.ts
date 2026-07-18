/**
 * Design tokens do jogo ("Tabuleiro do Sítio"). Fonte única de cores, tempos e
 * tamanhos da camada /jogo — sprites e camadas importam daqui, nunca hex solto.
 * Direção de arte completa em docs/game-design.md.
 */
export const gameTokens = {
  colors: {
    /** A "mesa" fora do perímetro (fundo do SVG, não do app). */
    paper: '#F5F0E4',
    /** Chão do sítio dentro do perímetro (sob os pastos). */
    ground: '#EDE8D6',
    /** Grama do terreno (piso dentro da cerca; mais amuada que os pastos,
     * para o patchwork saltar por cima). */
    grass: '#ADBF8B',
    grassLight: '#BFCF9E',
    /** Patchwork pastel dos pastos, indexado por styleVariant (cíclico). */
    pasture: ['#B7CE93', '#A4C17E', '#C9DBA8'] as const,
    /** Tom claro correspondente (gradiente de 2 stops, nunca mais que isso). */
    pastureLight: ['#C6D9A6', '#B5CD93', '#D6E3BA'] as const,
    /** Traço interno sutil entre pastos. */
    meadowEdge: '#8FA96B',
    /** Curral e entorno de instalações. */
    dirt: '#D9BC90',
    /** Cercas e madeira. */
    wood: '#8A6F4D',
    /** Sombra/testa dos mourões da cerca. */
    woodDark: '#6E5638',
    /** Cerca interna dos pastos: a mesma cerca, em madeira mais clara. */
    woodLight: '#B29A76',
    woodLightDark: '#95805D',
    /** Telhados — o accent quente; no máximo 2 destaques por cena. */
    roof: '#D98E73',
    /** Leite no tanque. */
    milk: '#FFF9EF',
    /** Metal do tanque e do caminhão. */
    steel: '#9FB4C7',
    /** Rótulos e ícones sobre o mapa. */
    ink: '#3A3D35',
    /** Copa das árvores. */
    tree: '#6E8F57',
    treeShade: '#5A7A46',
    /** Vacas (corpo claro + manchas). */
    cow: '#F7F2E9',
    cowSpot: '#4A443C',
  },
  motion: {
    /** Diorama "assenta" na mesa ao carregar. */
    settleMs: 400,
    /** Tanque enchendo após registro. */
    tankMs: 600,
    /** Caminhão do laticínio atravessando após coleta. */
    truckMs: 2400,
    /** Folha de ações deslizando (HUD fluido, ambientado no jogo). */
    sheetMs: 220,
  },
  sprite: {
    /** Grid local dos sprites: viewBox 0 0 64 64. */
    grid: 64,
  },
  /** Largura fixa do viewBox do mapa; a altura vem da razão de aspecto do perímetro. */
  viewBoxWidth: 1000,
  /** Máximo de sprites de vaca por pasto antes do badge +N. */
  herdClusterCap: 8,
  /** Cercas: espaçamento e raio dos mourões (unidades do viewBox). A do
   * perímetro é mais robusta; a dos pastos é a mesma cerca em escala menor. */
  fence: { postSpacing: 34, postRadius: 3.1, pasturePostSpacing: 28, pasturePostRadius: 2.2 },
} as const;

export type GameTokens = typeof gameTokens;
