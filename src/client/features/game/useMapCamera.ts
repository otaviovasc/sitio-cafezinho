import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { CAMERA_MAX_SCALE, CAMERA_MIN_SCALE, clampCamera, type CameraState } from '../../../domain/game/camera';

const MIN_SCALE = CAMERA_MIN_SCALE;
const MAX_SCALE = CAMERA_MAX_SCALE;

type Camera = CameraState;

/**
 * Pan/zoom hand-rolled do mapa: transform aplicado num único <g>
 * (data-testid="game-camera"), sem re-render por frame de nada além do
 * transform. Arrasto/pinça/roda + botões acessíveis (+/−/centralizar). O
 * enquadramento é a moldura do jogo: nunca afasta além do sítio inteiro e o
 * pan trava suavemente nos limites do terreno (clamp puro em domain/game/camera).
 */
export function useMapCamera(viewWidth: number, viewHeight: number) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  const clamp = useCallback((next: Camera): Camera => clampCamera(next, viewWidth, viewHeight), [viewWidth, viewHeight]);

  /** Converte px de tela em unidades do viewBox (o SVG preserva o aspecto). */
  const viewBoxFactor = useCallback((element: Element) => {
    const rect = element.getBoundingClientRect();
    return viewWidth / Math.max(rect.width, 1);
  }, [viewWidth]);

  const zoomAt = useCallback((factor: number, focusX: number, focusY: number) => {
    setCamera((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const worldX = (focusX - current.x) / current.scale;
      const worldY = (focusY - current.y) / current.scale;
      return clamp({ scale, x: focusX - worldX * scale, y: focusY - worldY * scale });
    });
  }, [clamp]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const factor = viewBoxFactor(event.currentTarget);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      const deltaX = (event.clientX - previous.x) * factor;
      const deltaY = (event.clientY - previous.y) * factor;
      setCamera((current) => clamp({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
      return;
    }
    if (pointers.current.size === 2 && pinchDistance.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = event.currentTarget.getBoundingClientRect();
      const midX = ((a.x + b.x) / 2 - rect.left) * factor;
      const midY = ((a.y + b.y) / 2 - rect.top) * factor;
      zoomAt(distance / pinchDistance.current, midX, midY);
      pinchDistance.current = distance;
    }
  }, [clamp, viewBoxFactor, zoomAt]);

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
  }, []);

  const onWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    const factor = viewBoxFactor(event.currentTarget);
    const rect = event.currentTarget.getBoundingClientRect();
    const focusX = (event.clientX - rect.left) * factor;
    const focusY = (event.clientY - rect.top) * factor;
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, focusX, focusY);
  }, [viewBoxFactor, zoomAt]);

  const zoomIn = useCallback(() => zoomAt(1.25, viewWidth / 2, viewHeight / 2), [zoomAt, viewWidth, viewHeight]);
  const zoomOut = useCallback(() => zoomAt(1 / 1.25, viewWidth / 2, viewHeight / 2), [zoomAt, viewWidth, viewHeight]);
  const reset = useCallback(() => setCamera({ x: 0, y: 0, scale: 1 }), []);

  const transform = useMemo(
    () => `translate(${camera.x.toFixed(2)} ${camera.y.toFixed(2)}) scale(${camera.scale.toFixed(3)})`,
    [camera],
  );

  return {
    transform,
    zoomIn,
    zoomOut,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel },
  };
}
