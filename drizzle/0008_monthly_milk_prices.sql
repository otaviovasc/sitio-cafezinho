CREATE TABLE "monthly_milk_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"price_per_liter" numeric(12,4) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_milk_prices_first_day" CHECK (extract(day from "monthly_milk_prices"."month") = 1),
	CONSTRAINT "monthly_milk_prices_positive" CHECK ("monthly_milk_prices"."price_per_liter" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_milk_prices_month_unique" ON "monthly_milk_prices" USING btree ("month");
