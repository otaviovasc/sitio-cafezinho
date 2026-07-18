/**
 * Regras puras da câmera do tabuleiro. O mapa é a moldura do jogo: o zoom
 * nunca afasta além do enquadramento inteiro (escala mínima = 1) e o pan é
 * travado nos limites do terreno — não existe "sair do mapa". O clamp roda a
 * cada frame de pan/zoom, então o movimento encosta suave no limite em vez de
 * quicar.
 */

export const CAMERA_MIN_SCALE = 1;
export const CAMERA_MAX_SCALE = 4;

export type CameraState = { x: number; y: number; scale: number };

/**
 * Restringe a câmera aos limites do tabuleiro: o conteúdo (0..viewWidth,
 * 0..viewHeight) sempre cobre a viewport. Com escala 1 o pan fica travado em
 * (0,0); ampliando, o alcance cresce proporcionalmente.
 */
export function clampCamera(next: CameraState, viewWidth: number, viewHeight: number): CameraState {
  const scale = Math.min(CAMERA_MAX_SCALE, Math.max(CAMERA_MIN_SCALE, next.scale));
  const minX = viewWidth - viewWidth * scale;
  const minY = viewHeight - viewHeight * scale;
  return {
    scale,
    x: Math.min(0, Math.max(minX, next.x)),
    y: Math.min(0, Math.max(minY, next.y)),
  };
}
