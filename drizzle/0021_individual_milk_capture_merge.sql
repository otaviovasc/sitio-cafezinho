ALTER TABLE "milk_sessions" ADD COLUMN "herd_group_id" uuid;--> statement-breakpoint
ALTER TABLE "milk_sessions" ADD CONSTRAINT "milk_sessions_herd_group_id_herd_groups_id_fk" FOREIGN KEY ("herd_group_id") REFERENCES "public"."herd_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milk_sessions_group_idx" ON "milk_sessions" USING btree ("herd_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milk_sessions_date_group_unique" ON "milk_sessions" USING btree ("session_date", "herd_group_id") WHERE "herd_group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "milk_sessions_date_whole_herd_unique" ON "milk_sessions" USING btree ("session_date") WHERE "herd_group_id" is null;--> statement-breakpoint

CREATE TABLE "milk_measurement_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "milk_measurement_id" uuid NOT NULL,
  "capture_id" uuid,
  "proposed_action_id" uuid,
  "raw_animal_label" text NOT NULL,
  "raw_value_text" text,
  "morning_liters" numeric(10, 2),
  "afternoon_liters" numeric(10, 2),
  "total_liters" numeric(10, 2),
  "confidence" "measurement_confidence" NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "milk_measurement_sources_non_negative" CHECK (
    ("total_liters" is null or "total_liters" >= 0) and
    ("morning_liters" is null or "morning_liters" >= 0) and
    ("afternoon_liters" is null or "afternoon_liters" >= 0)
  )
);--> statement-breakpoint
ALTER TABLE "milk_measurement_sources" ADD CONSTRAINT "milk_measurement_sources_milk_measurement_id_milk_measurements_id_fk" FOREIGN KEY ("milk_measurement_id") REFERENCES "public"."milk_measurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_measurement_sources" ADD CONSTRAINT "milk_measurement_sources_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_measurement_sources" ADD CONSTRAINT "milk_measurement_sources_proposed_action_id_proposed_actions_id_fk" FOREIGN KEY ("proposed_action_id") REFERENCES "public"."proposed_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milk_measurement_sources_measurement_idx" ON "milk_measurement_sources" USING btree ("milk_measurement_id");--> statement-breakpoint
CREATE INDEX "milk_measurement_sources_capture_idx" ON "milk_measurement_sources" USING btree ("capture_id");
