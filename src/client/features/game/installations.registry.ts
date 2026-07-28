import type { ComponentType } from 'react';
import type { MapInstallationKind } from '../../../domain/game/state';
import { BalancaSprite } from './sprites/BalancaSprite';
import { CasaSprite } from './sprites/CasaSprite';
import { DepositoSprite } from './sprites/DepositoSprite';
import { EnfermariaSprite } from './sprites/EnfermariaSprite';
import { EstacaoAlimentacaoSprite } from './sprites/EstacaoAlimentacaoSprite';
import { GaragemSprite } from './sprites/GaragemSprite';
import { MangueiraSprite } from './sprites/MangueiraSprite';
import { PorteiraSprite } from './sprites/PorteiraSprite';

/**
 * Registro declarativo das instalações do tabuleiro (fase 2): cada kind
 * declara sprite, folha, se é acionável e se pode se repetir no mapa. O
 * InstallationLayer e o editor leem daqui — adicionar uma instalação nova =
 * sprite + folha + 1 entrada neste registro (convenção em docs/game-design.md).
 *
 * ESTACAO_ALIMENTACAO é o Cocho: o valor do enum foi preservado para não
 * quebrar dados existentes; só os rótulos mudaram.
 */

/** Folha que o kind abre no jogo (GamePage resolve o componente pela chave). */
export type InstallationSheetKey =
  | 'mangueira' | 'deposito' | 'cocho'
  | 'loja' | 'lojaCombustivel'
  | 'casa' | 'balanca' | 'enfermaria';

export type InstallationSpriteProps = { x: number; y: number; size?: number };

export type InstallationRegistryEntry = {
  label: string;
  /** Dica exibida no editor ao posicionar. */
  hint: string;
  sprite: ComponentType<InstallationSpriteProps>;
  spriteSize: number;
  /** Acionável = botão com folha; decorativa = role="img". */
  actionable: boolean;
  /** Pode se repetir no mapa; o `name` diferencia e aparece no rótulo. */
  multiInstance: boolean;
  sheet: InstallationSheetKey;
  /** Mangueira: medidor do tanque renderizado ao lado do sprite. */
  withTank?: boolean;
};

export const INSTALLATION_REGISTRY: Record<MapInstallationKind, InstallationRegistryEntry> = {
  MANGUEIRA: {
    label: 'Mangueira',
    hint: 'O coração do jogo: ordenha e coleta acontecem aqui.',
    sprite: MangueiraSprite,
    spriteSize: 96,
    actionable: true,
    multiInstance: false,
    sheet: 'mangueira',
    withTank: true,
  },
  DEPOSITO: {
    label: 'Depósito',
    hint: 'Estoque de alimentação: compras e saldo por item.',
    sprite: DepositoSprite,
    spriteSize: 84,
    actionable: true,
    multiInstance: false,
    sheet: 'deposito',
  },
  ESTACAO_ALIMENTACAO: {
    label: 'Cocho',
    hint: 'O trato dado ao rebanho. Pode haver vários — o nome diferencia.',
    sprite: EstacaoAlimentacaoSprite,
    spriteSize: 84,
    actionable: true,
    multiInstance: true,
    sheet: 'cocho',
  },
  GARAGEM: {
    label: 'Garagem',
    hint: 'Combustível e manutenção: abre a Loja na prateleira certa.',
    sprite: GaragemSprite,
    spriteSize: 80,
    actionable: true,
    multiInstance: false,
    sheet: 'lojaCombustivel',
  },
  CASA: {
    label: 'Casa',
    hint: 'O escritório do sítio: contas e financeiro.',
    sprite: CasaSprite,
    spriteSize: 84,
    actionable: true,
    multiInstance: false,
    sheet: 'casa',
  },
  BALANCA: {
    label: 'Balança',
    hint: 'Pesagem do rebanho. Pode haver várias — o nome diferencia.',
    sprite: BalancaSprite,
    spriteSize: 80,
    actionable: true,
    multiInstance: true,
    sheet: 'balanca',
  },
  ENFERMARIA: {
    label: 'Enfermaria',
    hint: 'Cuidados de saúde (mastite e carências). Pode haver várias.',
    sprite: EnfermariaSprite,
    spriteSize: 84,
    actionable: true,
    multiInstance: true,
    sheet: 'enfermaria',
  },
  PORTEIRA: {
    label: 'Porteira',
    hint: 'Por onde tudo entra e sai: caminhão da coleta e compras da Loja.',
    sprite: PorteiraSprite,
    spriteSize: 80,
    actionable: true,
    multiInstance: false,
    sheet: 'loja',
  },
};
