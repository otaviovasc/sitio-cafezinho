ALTER TYPE "public"."map_installation_kind" ADD VALUE 'ESTACAO_ALIMENTACAO';--> statement-breakpoint
CREATE TYPE "public"."feed_unit" AS ENUM('KG', 'LITER', 'UNIT');--> statement-breakpoint
CREATE TYPE "public"."feeding_context" AS ENUM('MILKING', 'PASTURE', 'STATION');--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"canonical_unit" "feed_unit" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_purchase_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_item_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_purchase_entries_positive" CHECK ("feed_purchase_entries"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "feeding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"context" "feeding_context" NOT NULL,
	"herd_group_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeding_event_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feeding_event_id" uuid NOT NULL,
	"feed_item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "feeding_event_items_positive" CHECK ("feeding_event_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "feed_purchase_entries" ADD CONSTRAINT "feed_purchase_entries_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_purchase_entries" ADD CONSTRAINT "feed_purchase_entries_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_herd_group_id_herd_groups_id_fk" FOREIGN KEY ("herd_group_id") REFERENCES "public"."herd_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_event_items" ADD CONSTRAINT "feeding_event_items_feeding_event_id_feeding_events_id_fk" FOREIGN KEY ("feeding_event_id") REFERENCES "public"."feeding_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_event_items" ADD CONSTRAINT "feeding_event_items_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_name_unique" ON "feed_items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "feed_purchase_entries_item_idx" ON "feed_purchase_entries" USING btree ("feed_item_id");--> statement-breakpoint
CREATE INDEX "feed_purchase_entries_purchase_idx" ON "feed_purchase_entries" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "feeding_events_date_idx" ON "feeding_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "feeding_events_group_idx" ON "feeding_events" USING btree ("herd_group_id");--> statement-breakpoint
CREATE INDEX "feeding_event_items_event_idx" ON "feeding_event_items" USING btree ("feeding_event_id");--> statement-breakpoint
CREATE INDEX "feeding_event_items_item_idx" ON "feeding_event_items" USING btree ("feed_item_id");
