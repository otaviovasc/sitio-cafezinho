CREATE TYPE "public"."map_zone_kind" AS ENUM('PERIMETER', 'PASTURE');--> statement-breakpoint
CREATE TYPE "public"."map_installation_kind" AS ENUM('MANGUEIRA', 'DEPOSITO', 'GARAGEM', 'CASA');--> statement-breakpoint
CREATE TABLE "map_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "map_zone_kind" NOT NULL,
	"name" text NOT NULL,
	"herd_group_id" uuid,
	"ring" jsonb NOT NULL,
	"style_variant" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_zones_ring_min_points" CHECK (jsonb_array_length("map_zones"."ring") >= 3),
	CONSTRAINT "map_zones_perimeter_unlinked" CHECK ("map_zones"."kind" != 'PERIMETER' or "map_zones"."herd_group_id" is null)
);
--> statement-breakpoint
CREATE TABLE "map_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "map_installation_kind" NOT NULL,
	"name" text NOT NULL,
	"position" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_zones" ADD CONSTRAINT "map_zones_herd_group_id_herd_groups_id_fk" FOREIGN KEY ("herd_group_id") REFERENCES "public"."herd_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_zones_perimeter_unique" ON "map_zones" USING btree ("kind") WHERE "map_zones"."kind" = 'PERIMETER' and "map_zones"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "map_zones_herd_group_unique" ON "map_zones" USING btree ("herd_group_id") WHERE "map_zones"."herd_group_id" is not null and "map_zones"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "map_installations_kind_unique" ON "map_installations" USING btree ("kind") WHERE "map_installations"."active";
