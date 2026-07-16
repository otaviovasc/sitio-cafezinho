ALTER TABLE "daily_milk_totals" ADD COLUMN "herd_group_id" uuid;
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD CONSTRAINT "daily_milk_totals_herd_group_id_herd_groups_id_fk" FOREIGN KEY ("herd_group_id") REFERENCES "public"."herd_groups"("id") ON DELETE restrict;
--> statement-breakpoint
DROP INDEX "daily_milk_totals_date_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_milk_totals_date_overall_unique" ON "daily_milk_totals" USING btree ("production_date") WHERE "herd_group_id" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_milk_totals_date_group_unique" ON "daily_milk_totals" USING btree ("production_date", "herd_group_id") WHERE "herd_group_id" is not null;
--> statement-breakpoint
CREATE INDEX "daily_milk_totals_group_idx" ON "daily_milk_totals" USING btree ("herd_group_id");
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" DROP CONSTRAINT "daily_milk_totals_periods";
--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD CONSTRAINT "daily_milk_totals_periods" CHECK (
  ("morning_liters" is null and "afternoon_liters" is null)
  or
  ("morning_liters" is not null and "afternoon_liters" is null and "total_liters" = "morning_liters")
  or
  ("morning_liters" is not null and "afternoon_liters" is not null and "total_liters" = "morning_liters" + "afternoon_liters")
);
