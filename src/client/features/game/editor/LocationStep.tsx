import { useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import { parseLocationInput } from '../../../../domain/game/location';
import type { MapPoint } from '../../../../domain/game/state';
import { Button, Field, Input } from '../../../components/ui';

/**
 * Passo "Onde fica o seu sítio?" — parte do jogo, não um formulário burocrata:
 * tutorial ilustrado de como copiar as coordenadas no Google Maps + colagem
 * direta (ou geolocalização do celular como atalho).
 */
export function LocationStep({ onLocate }: { onLocate: (point: MapPoint) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  function submit() {
    const point = parseLocationInput(value);
    if (!point) {
      setError('Não reconheci essas coordenadas. Copie do Google Maps e cole aqui (ex.: -21.123456, -45.654321).');
      return;
    }
    setError('');
    onLocate(point);
  }

  function locateByDevice() {
    if (!navigator.geolocation) {
      setError('Este aparelho não compartilha localização. Cole as coordenadas do Google Maps.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocate({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setError('Não consegui usar a localização do aparelho. Cole as coordenadas do Google Maps.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return <div className="grid gap-4" data-testid="editor-location">
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold"><MapPin className="text-[var(--primary)]" size={20} aria-hidden />Onde fica o seu sítio?</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Vamos centralizar a foto de satélite no seu terreno. Só precisa fazer isso uma vez.</p>
    </div>
    <ol className="grid gap-2 text-sm">
      <li className="guide-step"><strong>1. Abra o Google Maps</strong><p>No celular ou no computador, procure a região do sítio.</p></li>
      <li className="guide-step"><strong>2. Toque e segure no seu sítio</strong><p>Um pino aparece e as coordenadas surgem na busca (ex.: -21.123456, -45.654321).</p></li>
      <li className="guide-step"><strong>3. Copie e cole aqui</strong><p>Vale colar as coordenadas ou o próprio link do Google Maps.</p></li>
    </ol>
    <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Field label="Coordenadas ou link do Maps" error={error || undefined}>
        <Input
          placeholder="-21.123456, -45.654321"
          value={value}
          onChange={(event) => { setValue(event.target.value); if (error) setError(''); }}
          inputMode="text"
          autoComplete="off"
          required
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Centralizar mapa</Button>
        <Button type="button" variant="secondary" onClick={locateByDevice} disabled={locating}>
          <Crosshair size={17} aria-hidden />{locating ? 'Localizando…' : 'Usar minha localização'}
        </Button>
      </div>
    </form>
  </div>;
}
