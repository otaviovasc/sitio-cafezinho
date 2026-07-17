ALTER TABLE "daily_milk_totals" DROP CONSTRAINT "daily_milk_totals_periods";--> statement-breakpoint
ALTER TABLE "daily_milk_totals" ADD CONSTRAINT "daily_milk_totals_periods" CHECK (
    ("daily_milk_totals"."morning_liters" is null and "daily_milk_totals"."afternoon_liters" is null)
    or
    ("daily_milk_totals"."morning_liters" is not null and "daily_milk_totals"."afternoon_liters" is null and "daily_milk_totals"."total_liters" = "daily_milk_totals"."morning_liters")
    or
    ("daily_milk_totals"."morning_liters" is null and "daily_milk_totals"."afternoon_liters" is not null and "daily_milk_totals"."total_liters" = "daily_milk_totals"."afternoon_liters")
    or
    ("daily_milk_totals"."morning_liters" is not null and "daily_milk_totals"."afternoon_liters" is not null and "daily_milk_totals"."total_liters" = "daily_milk_totals"."morning_liters" + "daily_milk_totals"."afternoon_liters")
  );
