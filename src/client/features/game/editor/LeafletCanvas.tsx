import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameMapInstallation, GameMapZone, MapPoint } from '../../../../domain/game/state';
import { gameTokens } from '../tokens';

// Satélite gratuito usado SÓ no editor (o jogo renderiza o próprio mapa).
// URL isolada aqui para troca fácil de provedor.
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Imagens © Esri — Esri, Maxar, Earthstar Geographics';

/** Centro neutro (Brasil) enquanto a pessoa não localiza o sítio. */
const BRAZIL_CENTER: MapPoint = { lat: -14.235, lng: -51.925 };

/**
 * Integração direta com Leaflet (sem react-leaflet): o mapa é criado uma vez e
 * as camadas são redesenhadas por efeito — zonas são poucas, redesenhar tudo é
 * mais simples e à prova de drift. Cliques funcionam mesmo sem os tiles
 * carregarem (e2e não depende de rede externa).
 */
export function LeafletCanvas({ center, zones, installations, draft, drawing, onMapClick }: {
  center: MapPoint | null;
  zones: GameMapZone[];
  installations: GameMapInstallation[];
  draft: MapPoint[];
  drawing: boolean;
  onMapClick: (point: MapPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<L.LayerGroup | null>(null);
  const draftRef = useRef<L.LayerGroup | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true });
    map.setView([BRAZIL_CENTER.lat, BRAZIL_CENTER.lng], 4);
    L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      clickHandlerRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    overlaysRef.current = L.layerGroup().addTo(map);
    draftRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      overlaysRef.current = null;
      draftRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (center) mapRef.current?.setView([center.lat, center.lng], 16);
  }, [center]);

  // O Leaflet acrescenta classes próprias ao container; se o React trocasse o
  // className, elas seriam apagadas (e os tiles perderiam o CSS que os
  // posiciona). Por isso o className do JSX é FIXO e o modo de desenho entra
  // por classList, sem passar pelo React.
  useEffect(() => {
    containerRef.current?.classList.toggle('game-editor-map-drawing', drawing);
  }, [drawing]);

  useEffect(() => {
    const overlays = overlaysRef.current;
    if (!overlays) return;
    overlays.clearLayers();
    const { colors } = gameTokens;
    for (const zone of zones) {
      const points = zone.ring.map((point) => [point.lat, point.lng] satisfies [number, number]);
      if (zone.kind === 'PERIMETER') {
        L.polygon(points, { color: colors.wood, weight: 3, dashArray: '8 6', fillColor: colors.paper, fillOpacity: 0.08 })
          .bindTooltip(zone.name).addTo(overlays);
      } else {
        L.polygon(points, {
          color: colors.meadowEdge,
          weight: 2,
          fillColor: colors.pasture[zone.styleVariant % colors.pasture.length],
          fillOpacity: 0.45,
        }).bindTooltip(zone.name).addTo(overlays);
      }
    }
    for (const installation of installations) {
      L.circleMarker([installation.position.lat, installation.position.lng], {
        radius: 9, color: colors.ink, weight: 2, fillColor: colors.roof, fillOpacity: 1,
      }).bindTooltip(installation.name).addTo(overlays);
    }
  }, [zones, installations]);

  useEffect(() => {
    const layer = draftRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!draft.length) return;
    const { colors } = gameTokens;
    const points = draft.map((point) => [point.lat, point.lng] satisfies [number, number]);
    if (draft.length >= 2) L.polyline(points, { color: colors.roof, weight: 2, dashArray: '4 4' }).addTo(layer);
    if (draft.length >= 3) L.polygon(points, { color: colors.roof, weight: 1, fillColor: colors.roof, fillOpacity: 0.12, dashArray: '4 4' }).addTo(layer);
    for (const [index, point] of draft.entries()) {
      L.circleMarker([point.lat, point.lng], {
        radius: 6,
        color: '#fffef9',
        weight: 2,
        fillColor: colors.roof,
        fillOpacity: 1,
        className: index === draft.length - 1 ? 'editor-vertex-new' : undefined,
      }).addTo(layer);
    }
  }, [draft]);

  return <div
    ref={containerRef}
    data-testid="editor-map"
    className="game-editor-map"
    role="application"
    aria-label="Mapa de satélite para traçar o sítio"
  />;
}
