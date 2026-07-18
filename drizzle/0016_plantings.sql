ALTER TYPE "public"."map_installation_kind" ADD VALUE 'PLANTACAO';--> statement-breakpoint
CREATE TYPE "public"."planting_status" AS ENUM('GROWING', 'HARVESTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "plantings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"crop_name" text NOT NULL,
	"planted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_hours" numeric(10, 3) NOT NULL,
	"status" "planting_status" DEFAULT 'GROWING' NOT NULL,
	"harvested_at" timestamp with time zone,
	"harvest_quantity" numeric(14, 3),
	"harvest_unit" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantings_duration_positive" CHECK ("plantings"."duration_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "planting_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planting_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "planting_inputs_positive" CHECK ("planting_inputs"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_installation_id_map_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."map_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planting_inputs" ADD CONSTRAINT "planting_inputs_planting_id_plantings_id_fk" FOREIGN KEY ("planting_id") REFERENCES "public"."plantings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plantings_growing_unique" ON "plantings" USING btree ("installation_id") WHERE "plantings"."status" = 'GROWING';--> statement-breakpoint
CREATE INDEX "plantings_installation_idx" ON "plantings" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "planting_inputs_planting_idx" ON "planting_inputs" USING btree ("planting_id");
