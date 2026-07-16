ALTER TABLE "milk_measurements" ALTER COLUMN "total_liters" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "milk_measurements" DROP CONSTRAINT "milk_measurements_non_negative";
--> statement-breakpoint
ALTER TABLE "milk_measurements" ADD CONSTRAINT "milk_measurements_non_negative" CHECK (
  ("milk_measurements"."total_liters" is null or "milk_measurements"."total_liters" >= 0) and
  ("milk_measurements"."morning_liters" is null or "milk_measurements"."morning_liters" >= 0) and
  ("milk_measurements"."afternoon_liters" is null or "milk_measurements"."afternoon_liters" >= 0)
);
