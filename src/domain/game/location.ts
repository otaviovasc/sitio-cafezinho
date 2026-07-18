import type { MapPoint } from './state.js';

/**
 * Parser do passo "Onde fica o seu sítio?" do editor. Aceita o que a pessoa
 * cola do Google Maps: "lat, lng" direto, link com "@lat,lng,zoom" ou "?q=".
 * Nunca adivinha: entrada ambígua → null (a UI explica como copiar de novo).
 */
export function parseLocationInput(raw: string): MapPoint | null {
  const text = raw.trim();
  if (!text) return null;

  // Link do Maps: .../@-21.123,-45.678,15z ou ...?q=-21.123,-45.678
  const urlMatch = text.match(/[@?&](?:q=)?(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (urlMatch) return validated(Number(urlMatch[1]), Number(urlMatch[2]));

  // Par de decimais soltos: "-21.123456, -45.654321" (vírgula ou espaço).
  const pairMatch = text.match(/^(-?\d{1,3}(?:[.,]\d+)?)[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (pairMatch) {
    const lat = Number(pairMatch[1].replace(',', '.'));
    const lng = Number(pairMatch[2].replace(',', '.'));
    // "-21,5 -45,7" (decimal com vírgula separado por espaço) também chega aqui.
    return validated(lat, lng);
  }

  return null;
}

function validated(lat: number, lng: number): MapPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Coordenada (0,0) ou inteiros curtos costumam ser colagem errada, mas não
  // adivinhamos: só barramos o claramente impossível (faixas acima).
  return { lat, lng };
}
