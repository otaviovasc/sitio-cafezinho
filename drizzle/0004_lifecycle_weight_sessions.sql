CREATE TYPE "public"."weight_source" AS ENUM('MANUAL', 'CHATGPT_IMPORT', 'DEMO_SEED');
--> statement-breakpoint
CREATE TABLE "animal_status_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "previous_status" "animal_status",
  "status" "animal_status" NOT NULL,
  "changed_on" date NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal_status_events" ADD CONSTRAINT "animal_status_events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "animal_status_events_animal_date_idx" ON "animal_status_events" USING btree ("animal_id", "changed_on");
--> statement-breakpoint
INSERT INTO "animal_status_events" ("animal_id", "previous_status", "status", "changed_on", "notes")
SELECT "id", NULL, "status", ("created_at" AT TIME ZONE 'America/Sao_Paulo')::date, 'Situação inicial preservada na migração.'
FROM "animals";
--> statement-breakpoint
CREATE TABLE "weight_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "measured_on" date NOT NULL,
  "title" text,
  "source" "weight_source" NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weight_sessions_date_unique" ON "weight_sessions" USING btree ("measured_on");
--> statement-breakpoint
ALTER TABLE "animal_weights" DROP CONSTRAINT "animal_weights_animal_id_animals_id_fk";
--> statement-breakpoint
ALTER TABLE "animal_weights" DROP CONSTRAINT "animal_weights_positive";
--> statement-breakpoint
ALTER TABLE "animal_weights" ALTER COLUMN "animal_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "animal_weights" ALTER COLUMN "weight_kg" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD COLUMN "weight_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD COLUMN "raw_animal_label" text;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD COLUMN "raw_value_text" text;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD COLUMN "confidence" "measurement_confidence" DEFAULT 'HIGH' NOT NULL;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD COLUMN "status" "measurement_status" DEFAULT 'CONFIRMED' NOT NULL;
--> statement-breakpoint
UPDATE "animal_weights" SET "raw_animal_label" = COALESCE(
  (SELECT COALESCE("animals"."name", "animals"."tag_number") FROM "animals" WHERE "animals"."id" = "animal_weights"."animal_id"),
  'Animal não identificado'
);
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD CONSTRAINT "animal_weights_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD CONSTRAINT "animal_weights_weight_session_id_weight_sessions_id_fk" FOREIGN KEY ("weight_session_id") REFERENCES "public"."weight_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD CONSTRAINT "animal_weights_positive" CHECK ("animal_weights"."weight_kg" is null or "animal_weights"."weight_kg" > 0);
--> statement-breakpoint
CREATE INDEX "animal_weights_session_idx" ON "animal_weights" USING btree ("weight_session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_weights_session_animal_unique" ON "animal_weights" USING btree ("weight_session_id", "animal_id") WHERE "animal_id" is not null;
