ALTER TABLE "animals" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "public"."animal_status" RENAME TO "animal_status_legacy";
--> statement-breakpoint
CREATE TYPE "public"."animal_status" AS ENUM('HEIFER', 'LACTATING', 'DRY', 'SOLD', 'DEAD');
--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" TYPE "public"."animal_status" USING (
  CASE "status"::text
    WHEN 'LACTATING' THEN 'LACTATING'
    WHEN 'DRY' THEN 'DRY'
    WHEN 'SOLD' THEN 'SOLD'
    WHEN 'DEAD' THEN 'DEAD'
    ELSE 'HEIFER'
  END
)::"public"."animal_status";
--> statement-breakpoint
ALTER TABLE "animal_status_events" ALTER COLUMN "previous_status" TYPE "public"."animal_status" USING (
  CASE
    WHEN "previous_status" IS NULL THEN NULL
    ELSE CASE "previous_status"::text
      WHEN 'LACTATING' THEN 'LACTATING'
      WHEN 'DRY' THEN 'DRY'
      WHEN 'SOLD' THEN 'SOLD'
      WHEN 'DEAD' THEN 'DEAD'
      ELSE 'HEIFER'
    END
  END
)::"public"."animal_status";
--> statement-breakpoint
ALTER TABLE "animal_status_events" ALTER COLUMN "status" TYPE "public"."animal_status" USING (
  CASE "status"::text
    WHEN 'LACTATING' THEN 'LACTATING'
    WHEN 'DRY' THEN 'DRY'
    WHEN 'SOLD' THEN 'SOLD'
    WHEN 'DEAD' THEN 'DEAD'
    ELSE 'HEIFER'
  END
)::"public"."animal_status";
--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" SET DEFAULT 'HEIFER'::"public"."animal_status";
--> statement-breakpoint
DROP TYPE "public"."animal_status_legacy";
--> statement-breakpoint
CREATE TYPE "public"."reproductive_event_type" AS ENUM('HEAT', 'CALVING');
--> statement-breakpoint
CREATE TYPE "public"."reproductive_outcome" AS ENUM('PENDING', 'NOT_PREGNANT', 'PREGNANT');
--> statement-breakpoint
CREATE TABLE "animal_reproductive_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "status_event_id" uuid,
  "type" "reproductive_event_type" NOT NULL,
  "occurred_on" date NOT NULL,
  "had_breeding" boolean DEFAULT false NOT NULL,
  "bull_name" text,
  "outcome" "reproductive_outcome",
  "outcome_recorded_on" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "animal_reproductive_events_shape" CHECK (
    ("type" = 'CALVING' and "had_breeding" = false and "bull_name" is null and "outcome" is null and "outcome_recorded_on" is null)
    or
    ("type" = 'HEAT' and (
      ("had_breeding" = false and "bull_name" is null and "outcome" is null and "outcome_recorded_on" is null)
      or
      ("had_breeding" = true and "outcome" is not null)
    ))
  ),
  CONSTRAINT "animal_reproductive_events_outcome_date" CHECK ("outcome_recorded_on" is null or "outcome_recorded_on" >= "occurred_on")
);
--> statement-breakpoint
ALTER TABLE "animal_reproductive_events" ADD CONSTRAINT "animal_reproductive_events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "animal_reproductive_events" ADD CONSTRAINT "animal_reproductive_events_status_event_id_animal_status_events_id_fk" FOREIGN KEY ("status_event_id") REFERENCES "public"."animal_status_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "animal_reproductive_events_animal_date_idx" ON "animal_reproductive_events" USING btree ("animal_id", "occurred_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_reproductive_events_status_event_unique" ON "animal_reproductive_events" USING btree ("status_event_id") WHERE "status_event_id" is not null;
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD COLUMN "morning_liters" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD COLUMN "afternoon_liters" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" DROP CONSTRAINT "daily_milk_totals_non_negative";
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD CONSTRAINT "daily_milk_totals_non_negative" CHECK (
  "total_liters" >= 0 and
  ("morning_liters" is null or "morning_liters" >= 0) and
  ("afternoon_liters" is null or "afternoon_liters" >= 0)
);
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD CONSTRAINT "daily_milk_totals_periods" CHECK (
  ("morning_liters" is null and "afternoon_liters" is null)
  or
  ("morning_liters" is not null and "afternoon_liters" is not null and "total_liters" = "morning_liters" + "afternoon_liters")
);
