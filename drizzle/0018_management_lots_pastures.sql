-- Novas situações de vida: cria (até desmame), recria/engorda e touro.
ALTER TYPE "public"."animal_status" ADD VALUE 'CALF';
--> statement-breakpoint
ALTER TYPE "public"."animal_status" ADD VALUE 'GROWING';
--> statement-breakpoint
ALTER TYPE "public"."animal_status" ADD VALUE 'BULL';
--> statement-breakpoint
CREATE TYPE "public"."animal_sex" AS ENUM('FEMALE', 'MALE');
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "sex" "animal_sex";
--> statement-breakpoint
-- Backfill: as situações anteriores (HEIFER/LACTATING/DRY) são femininas por
-- definição; não é dado inventado, é derivação do enum de situação.
UPDATE "animals" SET "sex" = 'FEMALE';
--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "sex" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "dam_id" uuid;
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "sire_id" uuid;
--> statement-breakpoint
CREATE INDEX "animals_dam_idx" ON "animals" USING btree ("dam_id");
--> statement-breakpoint
CREATE INDEX "animals_sire_idx" ON "animals" USING btree ("sire_id");
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_dam_id_animals_id_fk" FOREIGN KEY ("dam_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_sire_id_animals_id_fk" FOREIGN KEY ("sire_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_not_own_dam" CHECK ("dam_id" is null or "dam_id" != "id");
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_not_own_sire" CHECK ("sire_id" is null or "sire_id" != "id");
--> statement-breakpoint
-- Pasto vira entidade real da fazenda.
CREATE TABLE "pastures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"area_ha" numeric(8, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pastures_name_unique" ON "pastures" USING btree ("name");
--> statement-breakpoint
-- Histórico datado de ocupação lote↔pasto: um pasto abriga no máximo um lote
-- por vez e um lote ocupa no máximo um pasto por vez.
CREATE TABLE "pasture_occupancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pasture_id" uuid NOT NULL,
	"herd_group_id" uuid NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pasture_occupancies_dates" CHECK ("ended_on" is null or "ended_on" >= "started_on")
);
--> statement-breakpoint
ALTER TABLE "pasture_occupancies" ADD CONSTRAINT "pasture_occupancies_pasture_id_pastures_id_fk" FOREIGN KEY ("pasture_id") REFERENCES "public"."pastures"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pasture_occupancies" ADD CONSTRAINT "pasture_occupancies_herd_group_id_herd_groups_id_fk" FOREIGN KEY ("herd_group_id") REFERENCES "public"."herd_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pasture_occupancies_pasture_date_idx" ON "pasture_occupancies" USING btree ("pasture_id", "started_on");
--> statement-breakpoint
CREATE INDEX "pasture_occupancies_group_date_idx" ON "pasture_occupancies" USING btree ("herd_group_id", "started_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "pasture_occupancies_current_pasture_unique" ON "pasture_occupancies" USING btree ("pasture_id") WHERE "ended_on" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "pasture_occupancies_current_group_unique" ON "pasture_occupancies" USING btree ("herd_group_id") WHERE "ended_on" is null;
--> statement-breakpoint
-- Conversão do mapa: cada zona de pasto ativa vira um pasto real com o mesmo
-- nome. Nomes duplicados entre zonas colapsam em um único pasto.
ALTER TABLE "map_zones" ADD COLUMN "pasture_id" uuid;
--> statement-breakpoint
INSERT INTO "pastures" ("id", "name", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), "name", true, now(), now()
FROM "map_zones"
WHERE "kind" = 'PASTURE' AND "active"
GROUP BY "name";
--> statement-breakpoint
UPDATE "map_zones" mz SET "pasture_id" = p."id"
FROM "pastures" p
WHERE mz."kind" = 'PASTURE' AND mz."active" AND p."name" = mz."name";
--> statement-breakpoint
-- O vínculo decorativo zona↔lote vira a ocupação inicial real do pasto,
-- datada na migration. Converte configuração já registrada, não inventa fato.
INSERT INTO "pasture_occupancies" ("id", "pasture_id", "herd_group_id", "started_on", "notes", "created_at", "updated_at")
SELECT gen_random_uuid(), mz."pasture_id", mz."herd_group_id", CURRENT_DATE, 'Importado do mapa', now(), now()
FROM "map_zones" mz
WHERE mz."kind" = 'PASTURE' AND mz."active" AND mz."herd_group_id" IS NOT NULL AND mz."pasture_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "map_zones" DROP CONSTRAINT "map_zones_herd_group_id_herd_groups_id_fk";
--> statement-breakpoint
DROP INDEX "map_zones_herd_group_unique";
--> statement-breakpoint
ALTER TABLE "map_zones" DROP COLUMN "herd_group_id";
--> statement-breakpoint
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_pasture_id_pastures_id_fk" FOREIGN KEY ("pasture_id") REFERENCES "public"."pastures"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "map_zones_pasture_unique" ON "map_zones" USING btree ("pasture_id") WHERE "pasture_id" is not null and "active";
--> statement-breakpoint
-- O CHECK antigo (perimeter_unlinked) já foi removido pelo DROP COLUMN acima,
-- pois referenciava herd_group_id; recriado aqui sobre pasture_id.
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_perimeter_unlinked" CHECK ("kind" != 'PERIMETER' or "pasture_id" is null);
