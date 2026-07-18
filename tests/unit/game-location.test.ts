import { describe, expect, it } from 'vitest';
import { parseLocationInput } from '../../src/domain/game/location';

describe('parseLocationInput', () => {
  it('aceita par decimal com ponto', () => {
    expect(parseLocationInput('-21.123456, -45.654321')).toEqual({ lat: -21.123456, lng: -45.654321 });
  });
  it('aceita par decimal com vírgula separado por espaço', () => {
    expect(parseLocationInput('-21,5 -45,7')).toEqual({ lat: -21.5, lng: -45.7 });
  });
  it('aceita link do Google Maps com @lat,lng,zoom', () => {
    expect(parseLocationInput('https://www.google.com/maps/@-21.123456,-45.654321,15z')).toEqual({ lat: -21.123456, lng: -45.654321 });
  });
  it('aceita link com ?q=lat,lng', () => {
    expect(parseLocationInput('https://maps.google.com/?q=-21.1,-45.2')).toEqual({ lat: -21.1, lng: -45.2 });
  });
  it('rejeita texto sem coordenadas', () => {
    expect(parseLocationInput('sítio do cafezinho')).toBeNull();
    expect(parseLocationInput('')).toBeNull();
  });
  it('rejeita coordenadas fora da faixa', () => {
    expect(parseLocationInput('95.0, -45.0')).toBeNull();
    expect(parseLocationInput('-21.0, 195.0')).toBeNull();
  });
});
