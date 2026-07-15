CREATE TABLE "daily_milk_totals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "production_date" date NOT NULL,
  "total_liters" numeric(12,2) NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_milk_totals_non_negative" CHECK ("daily_milk_totals"."total_liters" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_milk_totals_date_unique" ON "daily_milk_totals" USING btree ("production_date");
