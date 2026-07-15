CREATE TYPE "public"."milking_routine" AS ENUM('MORNING_AND_AFTERNOON', 'MORNING_ONLY', 'NOT_MILKED');
--> statement-breakpoint
CREATE TABLE "herd_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "milking_routine" "milking_routine" NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "herd_groups_name_unique" ON "herd_groups" USING btree ("name");
--> statement-breakpoint
CREATE TABLE "animal_group_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "started_on" date NOT NULL,
  "ended_on" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "animal_group_assignment_dates" CHECK ("animal_group_assignments"."ended_on" is null or "animal_group_assignments"."ended_on" >= "animal_group_assignments"."started_on")
);
--> statement-breakpoint
ALTER TABLE "animal_group_assignments" ADD CONSTRAINT "animal_group_assignments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animal_group_assignments" ADD CONSTRAINT "animal_group_assignments_group_id_herd_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."herd_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "animal_group_assignments_animal_date_idx" ON "animal_group_assignments" USING btree ("animal_id", "started_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_group_assignments_current_unique" ON "animal_group_assignments" USING btree ("animal_id") WHERE "ended_on" is null;
--> statement-breakpoint
INSERT INTO "herd_groups" ("name", "milking_routine") VALUES
  ('Lote 1', 'MORNING_AND_AFTERNOON'),
  ('Lote 2', 'MORNING_ONLY')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "animal_group_assignments" ("animal_id", "group_id", "started_on")
SELECT "animals"."id", "herd_groups"."id", "animals"."created_at"::date
FROM "animals"
CROSS JOIN "herd_groups"
WHERE "herd_groups"."name" = 'Lote 1'
  AND NOT EXISTS (
    SELECT 1 FROM "animal_group_assignments"
    WHERE "animal_group_assignments"."animal_id" = "animals"."id"
      AND "animal_group_assignments"."ended_on" IS NULL
  );
