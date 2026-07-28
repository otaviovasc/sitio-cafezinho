-- Fase 2 do jogo: mundo de fazenda real.
-- 1) map_zone_kind ganha PLOT (talhão/roça como zona de terra). O enum é
-- recriado porque ALTER TYPE ... ADD VALUE não pode ser usado dentro da
-- transação do migrador; o índice e o check que citam 'PERIMETER' caem e
-- voltam logo depois.
ALTER TYPE "public"."map_zone_kind" RENAME TO "map_zone_kind_old";--> statement-breakpoint
CREATE TYPE "public"."map_zone_kind" AS ENUM('PERIMETER', 'PASTURE', 'PLOT');--> statement-breakpoint
DROP INDEX "map_zones_perimeter_unique";--> statement-breakpoint
ALTER TABLE "map_zones" DROP CONSTRAINT "map_zones_perimeter_unlinked";--> statement-breakpoint
ALTER TABLE "map_zones" ALTER COLUMN "kind" TYPE "public"."map_zone_kind" USING "kind"::text::"public"."map_zone_kind";--> statement-breakpoint
DROP TYPE "public"."map_zone_kind_old";--> statement-breakpoint
CREATE UNIQUE INDEX "map_zones_perimeter_unique" ON "map_zones" USING btree ("kind") WHERE "kind" = 'PERIMETER' and "active";--> statement-breakpoint
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_perimeter_unlinked" CHECK ("kind" != 'PERIMETER' or "pasture_id" is null);--> statement-breakpoint

-- 2) plantings passam a referenciar a zona PLOT (o talhão), não mais uma
-- instalação. Cada instalação PLANTACAO existente vira uma zona PLOT com um
-- anel pequeno em volta do ponto (o traçado fino vem depois, pelo editor) e
-- os plantios são religados sem perder nada.
ALTER TABLE "plantings" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
-- A FK antiga (installation_id → map_installations) tem ON DELETE CASCADE:
-- sem derrubá-la antes, apagar a instalação no loop abaixo apagaria os
-- plantios em cascata (perda de fato de fazenda — proibido).
ALTER TABLE "plantings" DROP CONSTRAINT "plantings_installation_id_map_installations_id_fk";--> statement-breakpoint
DO $$
DECLARE
  inst RECORD;
  new_zone_id uuid;
  base_lat double precision;
  base_lng double precision;
  half constant double precision := 0.0002;
BEGIN
  FOR inst IN SELECT id, name, position FROM map_installations WHERE kind = 'PLANTACAO' LOOP
    base_lat := (inst.position->>'lat')::double precision;
    base_lng := (inst.position->>'lng')::double precision;
    INSERT INTO map_zones (kind, name, ring, style_variant, active)
    VALUES ('PLOT', inst.name, jsonb_build_array(
      jsonb_build_object('lat', base_lat + half, 'lng', base_lng - half),
      jsonb_build_object('lat', base_lat + half, 'lng', base_lng + half),
      jsonb_build_object('lat', base_lat - half, 'lng', base_lng + half),
      jsonb_build_object('lat', base_lat - half, 'lng', base_lng - half)
    ), 0, true)
    RETURNING id INTO new_zone_id;
    UPDATE plantings SET zone_id = new_zone_id WHERE installation_id = inst.id;
    DELETE FROM map_installations WHERE id = inst.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "plantings" DROP COLUMN "installation_id";--> statement-breakpoint
ALTER TABLE "plantings" ALTER COLUMN "zone_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_zone_id_map_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."map_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plantings_growing_unique" ON "plantings" USING btree ("zone_id") WHERE "status" = 'GROWING';--> statement-breakpoint
CREATE INDEX "plantings_zone_idx" ON "plantings" USING btree ("zone_id");--> statement-breakpoint

-- 3) Instalações: PLANTACAO sai do enum (virou zona de terra); entram
-- BALANCA, ENFERMARIA e PORTEIRA. Recriação pelo mesmo motivo do passo 1.
ALTER TYPE "public"."map_installation_kind" RENAME TO "map_installation_kind_old";--> statement-breakpoint
CREATE TYPE "public"."map_installation_kind" AS ENUM('MANGUEIRA', 'DEPOSITO', 'GARAGEM', 'CASA', 'ESTACAO_ALIMENTACAO', 'BALANCA', 'ENFERMARIA', 'PORTEIRA');--> statement-breakpoint
ALTER TABLE "map_installations" ALTER COLUMN "kind" TYPE "public"."map_installation_kind" USING "kind"::text::"public"."map_installation_kind";--> statement-breakpoint
DROP TYPE "public"."map_installation_kind_old";--> statement-breakpoint

-- 4) Multi-instância: cocho (ESTACAO_ALIMENTACAO), balança e enfermaria podem
-- se repetir no mapa (o name diferencia); as demais continuam únicas.
DROP INDEX "map_installations_kind_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "map_installations_singleton_kind_unique" ON "map_installations" USING btree ("kind") WHERE "active" and "kind" in ('MANGUEIRA', 'DEPOSITO', 'GARAGEM', 'CASA', 'PORTEIRA');
