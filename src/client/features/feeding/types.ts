import type { FeedUnit } from '../../../domain/feeding';
import { feedUnitSuffix } from '../../../domain/feeding';

export type FeedItemRow = {
  id: string;
  name: string;
  canonicalUnit: FeedUnit;
  active: boolean;
};

export type FeedInventoryRow = {
  feedItemId: string;
  name: string;
  canonicalUnit: FeedUnit;
  active: boolean;
  purchasedQuantity: number;
  consumedQuantity: number;
  balance: number;
};

export function formatFeedQuantity(value: number, unit: FeedUnit): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${feedUnitSuffix[unit]}`;
}
