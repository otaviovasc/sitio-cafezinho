import type { FeedUnit } from '../../../domain/feeding';

/**
 * Catálogo da Loja do sítio: itens populares com preço/quantidade SUGERIDOS
 * como placeholder — o jogador ajusta antes de comprar; nada aqui é fato. A
 * compra grava o fato real em /api/purchases e, quando o item é estocável
 * (stockable), credita o Depósito via feed_items + feed_purchase_entries.
 */

export type LojaCategoryId = 'sementes' | 'fertilizantes' | 'racao' | 'saude' | 'ordenha' | 'combustivel' | 'manutencao';

export type PurchaseCategory = 'FEED' | 'MINERAL_SUPPLEMENT' | 'MEDICINE' | 'MILKING_AND_HYGIENE' | 'MAINTENANCE' | 'FUEL' | 'ENERGY' | 'ANIMAL_PURCHASE' | 'OTHER';

export type LojaItem = {
  id: string;
  name: string;
  emoji: string;
  category: LojaCategoryId;
  /** "saco 50 kg", "frasco 500 ml"… — como o item é vendido, para o hint. */
  packLabel: string;
  /** O nome do pacote em si ("saco", "frasco", "rolo"…) — vira sufixo do campo
   * de quantidade e entra na descrição da compra ("3 sacos"). */
  packNoun: string;
  /** Unidade do ITEM da compra em /compras (linha da nota: 3 × BAG…). */
  purchaseUnit: 'UNIT' | 'KG' | 'LITER' | 'BAG' | 'BOX' | 'OTHER';
  purchaseCategory: PurchaseCategory;
  /** Preço sugerido POR PACOTE (placeholder editável), em R$. */
  suggestedPrice: number;
  /** Item entra no estoque do Depósito? (insumos de plantio e alimentação) */
  stockable: boolean;
  /** Só para stockable: unidade canônica e quantidade do pacote nessa unidade
   * (o "saco de X kg" — editável na compra). */
  canonicalUnit?: FeedUnit;
  defaultQuantity?: number;
};

export const LOJA_CATEGORIES: Array<{ id: LojaCategoryId; label: string; emoji: string }> = [
  { id: 'sementes', label: 'Sementes', emoji: '🌱' },
  { id: 'fertilizantes', label: 'Fertilizantes', emoji: '🧪' },
  { id: 'racao', label: 'Ração e sal', emoji: '🐄' },
  { id: 'saude', label: 'Saúde animal', emoji: '💉' },
  { id: 'ordenha', label: 'Ordenha e higiene', emoji: '🧼' },
  { id: 'combustivel', label: 'Combustível', emoji: '⛽' },
  { id: 'manutencao', label: 'Manutenção', emoji: '🔧' },
];

export const LOJA_ITEMS: LojaItem[] = [
  // Sementes (estocáveis: viram insumo de plantio no Depósito)
  { id: 'semente-milho', name: 'Semente de milho', emoji: '🌽', category: 'sementes', packLabel: 'saco 20 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 420, stockable: true, canonicalUnit: 'KG', defaultQuantity: 20 },
  { id: 'semente-capim', name: 'Semente de capim braquiária', emoji: '🌾', category: 'sementes', packLabel: 'saco 10 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 350, stockable: true, canonicalUnit: 'KG', defaultQuantity: 10 },
  { id: 'semente-sorgo', name: 'Semente de sorgo', emoji: '🌻', category: 'sementes', packLabel: 'saco 20 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 380, stockable: true, canonicalUnit: 'KG', defaultQuantity: 20 },
  // Fertilizantes
  { id: 'adubo-npk', name: 'Adubo NPK 20-05-20', emoji: '🧪', category: 'fertilizantes', packLabel: 'saco 50 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 190, stockable: true, canonicalUnit: 'KG', defaultQuantity: 50 },
  { id: 'ureia', name: 'Ureia agrícola', emoji: '⚗️', category: 'fertilizantes', packLabel: 'saco 50 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 165, stockable: true, canonicalUnit: 'KG', defaultQuantity: 50 },
  { id: 'calcario', name: 'Calcário dolomítico', emoji: '🪨', category: 'fertilizantes', packLabel: 'big bag 1 t', packNoun: 'big bag', purchaseUnit: 'BAG', purchaseCategory: 'OTHER', suggestedPrice: 260, stockable: true, canonicalUnit: 'KG', defaultQuantity: 1000 },
  // Ração e sal (alimentação do rebanho)
  { id: 'racao-lactacao', name: 'Ração lactação 22%', emoji: '🐄', category: 'racao', packLabel: 'saco 40 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'FEED', suggestedPrice: 105, stockable: true, canonicalUnit: 'KG', defaultQuantity: 40 },
  { id: 'sal-mineral', name: 'Sal mineral', emoji: '🧂', category: 'racao', packLabel: 'saco 30 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'MINERAL_SUPPLEMENT', suggestedPrice: 135, stockable: true, canonicalUnit: 'KG', defaultQuantity: 30 },
  { id: 'farelo-soja', name: 'Farelo de soja', emoji: '🫘', category: 'racao', packLabel: 'saco 50 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'FEED', suggestedPrice: 145, stockable: true, canonicalUnit: 'KG', defaultQuantity: 50 },
  { id: 'milho-moido', name: 'Milho moído', emoji: '🌽', category: 'racao', packLabel: 'saco 50 kg', packNoun: 'saco', purchaseUnit: 'BAG', purchaseCategory: 'FEED', suggestedPrice: 95, stockable: true, canonicalUnit: 'KG', defaultQuantity: 50 },
  // Saúde animal (só compra; não vai para o estoque do Depósito)
  { id: 'vermifugo', name: 'Vermífugo', emoji: '💉', category: 'saude', packLabel: 'frasco 500 ml', packNoun: 'frasco', purchaseUnit: 'UNIT', purchaseCategory: 'MEDICINE', suggestedPrice: 85, stockable: false },
  { id: 'mata-bicheira', name: 'Mata-bicheira spray', emoji: '🧴', category: 'saude', packLabel: 'frasco 500 ml', packNoun: 'frasco', purchaseUnit: 'UNIT', purchaseCategory: 'MEDICINE', suggestedPrice: 40, stockable: false },
  { id: 'antibiotico', name: 'Antibiótico', emoji: '💊', category: 'saude', packLabel: 'frasco 100 ml', packNoun: 'frasco', purchaseUnit: 'UNIT', purchaseCategory: 'MEDICINE', suggestedPrice: 95, stockable: false },
  // Ordenha e higiene
  { id: 'detergente', name: 'Detergente alcalino', emoji: '🧼', category: 'ordenha', packLabel: 'bombona 5 L', packNoun: 'bombona', purchaseUnit: 'UNIT', purchaseCategory: 'MILKING_AND_HYGIENE', suggestedPrice: 60, stockable: false },
  { id: 'dipping', name: 'Pré/pós-dipping', emoji: '🧴', category: 'ordenha', packLabel: 'bombona 5 L', packNoun: 'bombona', purchaseUnit: 'UNIT', purchaseCategory: 'MILKING_AND_HYGIENE', suggestedPrice: 90, stockable: false },
  { id: 'papel-toalha', name: 'Papel toalha', emoji: '🧻', category: 'ordenha', packLabel: 'fardo 1000 folhas', packNoun: 'fardo', purchaseUnit: 'BOX', purchaseCategory: 'MILKING_AND_HYGIENE', suggestedPrice: 45, stockable: false },
  // Combustível
  { id: 'diesel', name: 'Diesel S10', emoji: '⛽', category: 'combustivel', packLabel: 'bombona 50 L', packNoun: 'bombona', purchaseUnit: 'UNIT', purchaseCategory: 'FUEL', suggestedPrice: 300, stockable: false },
  // Manutenção
  { id: 'mourao', name: 'Mourão de eucalipto', emoji: '🪵', category: 'manutencao', packLabel: 'unidade', packNoun: 'un', purchaseUnit: 'UNIT', purchaseCategory: 'MAINTENANCE', suggestedPrice: 25, stockable: false },
  { id: 'arame', name: 'Arame liso', emoji: '🔩', category: 'manutencao', packLabel: 'rolo 500 m', packNoun: 'rolo', purchaseUnit: 'UNIT', purchaseCategory: 'MAINTENANCE', suggestedPrice: 320, stockable: false },
  { id: 'conserto', name: 'Peças e conserto', emoji: '🔧', category: 'manutencao', packLabel: 'valor avulso', packNoun: 'un', purchaseUnit: 'UNIT', purchaseCategory: 'MAINTENANCE', suggestedPrice: 100, stockable: false },
];
