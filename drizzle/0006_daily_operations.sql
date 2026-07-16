CREATE TYPE "public"."milk_collection_source" AS ENUM('DRIVER_READING', 'TANK_READING', 'RECEIPT', 'OTHER');
--> statement-breakpoint
CREATE TYPE "public"."mastitis_quarter" AS ENUM('FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'MULTIPLE', 'UNKNOWN');
--> statement-breakpoint
CREATE TYPE "public"."mastitis_detection_method" AS ENUM('VISUAL', 'BLACK_PLATE', 'CMT', 'VETERINARY', 'OTHER', 'UNKNOWN');
--> statement-breakpoint
CREATE TYPE "public"."mastitis_status" AS ENUM('OBSERVATION', 'IN_TREATMENT', 'WITHDRAWAL_PERIOD', 'RESOLVED', 'RECURRENT', 'NO_IMPROVEMENT', 'CANCELLED');
--> statement-breakpoint
CREATE TYPE "public"."mastitis_outcome" AS ENUM('RESOLVED', 'IMPROVED', 'RECURRENT', 'NO_IMPROVEMENT', 'ANIMAL_CULLED', 'UNKNOWN');
--> statement-breakpoint
CREATE TYPE "public"."revenue_category" AS ENUM('MILK_SALE', 'CALF_SALE', 'CULL_SALE', 'ANIMAL_SALE', 'OTHER');
--> statement-breakpoint
CREATE TYPE "public"."revenue_status" AS ENUM('EXPECTED', 'RECEIVED', 'CANCELLED');
--> statement-breakpoint
CREATE TYPE "public"."animal_exit_type" AS ENUM('CALF_SALE', 'BREEDING_SALE', 'PRODUCTIVE_CULL', 'HEALTH_CULL', 'MEAT_SALE', 'OTHER');
--> statement-breakpoint

CREATE TABLE "milk_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_date" date NOT NULL,
  "collected_at" timestamp with time zone,
  "liters" numeric(12,2) NOT NULL,
  "source" "milk_collection_source" DEFAULT 'TANK_READING' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "milk_collections_positive" CHECK ("milk_collections"."liters" > 0)
);
--> statement-breakpoint
CREATE INDEX "milk_collections_date_idx" ON "milk_collections" USING btree ("collection_date");
--> statement-breakpoint

CREATE TABLE "mastitis_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "detected_at" timestamp with time zone NOT NULL,
  "affected_quarter" "mastitis_quarter",
  "detection_method" "mastitis_detection_method",
  "observed_signs" text,
  "status" "mastitis_status" DEFAULT 'OBSERVATION' NOT NULL,
  "treatment_summary" text,
  "treatment_started_at" timestamp with time zone,
  "treatment_expected_end_at" timestamp with time zone,
  "withdrawal_ends_at" date,
  "milk_discard_required" boolean DEFAULT false NOT NULL,
  "outcome" "mastitis_outcome",
  "notes" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mastitis_cases" ADD CONSTRAINT "mastitis_cases_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "mastitis_cases_animal_date_idx" ON "mastitis_cases" USING btree ("animal_id", "detected_at");
--> statement-breakpoint
CREATE INDEX "mastitis_cases_status_idx" ON "mastitis_cases" USING btree ("status");
--> statement-breakpoint

CREATE TABLE "mastitis_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mastitis_case_id" uuid NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "action_description" text NOT NULL,
  "completed_at" timestamp with time zone,
  "completion_notes" text,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mastitis_actions" ADD CONSTRAINT "mastitis_actions_mastitis_case_id_mastitis_cases_id_fk" FOREIGN KEY ("mastitis_case_id") REFERENCES "public"."mastitis_cases"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "mastitis_actions_case_schedule_idx" ON "mastitis_actions" USING btree ("mastitis_case_id", "scheduled_for");
--> statement-breakpoint

CREATE TABLE "revenues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "revenue_date" date NOT NULL,
  "category" "revenue_category" NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "status" "revenue_status" DEFAULT 'EXPECTED' NOT NULL,
  "received_at" timestamp with time zone,
  "animal_id" uuid,
  "period_start" date,
  "period_end" date,
  "quantity" numeric(14,3),
  "unit_price" numeric(12,4),
  "bonus_amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "discount_amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "buyer_name" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenues_positive_amount" CHECK ("revenues"."amount" > 0),
  CONSTRAINT "revenues_non_negative_details" CHECK (
    ("revenues"."quantity" is null or "revenues"."quantity" > 0) and
    ("revenues"."unit_price" is null or "revenues"."unit_price" >= 0) and
    "revenues"."bonus_amount" >= 0 and "revenues"."discount_amount" >= 0
  ),
  CONSTRAINT "revenues_period" CHECK ("revenues"."period_end" is null or "revenues"."period_start" is null or "revenues"."period_end" >= "revenues"."period_start")
);
--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "revenues_date_idx" ON "revenues" USING btree ("revenue_date");
--> statement-breakpoint
CREATE INDEX "revenues_animal_idx" ON "revenues" USING btree ("animal_id");
--> statement-breakpoint

CREATE TABLE "animal_exits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "status_event_id" uuid NOT NULL,
  "exit_type" "animal_exit_type",
  "reason" text,
  "buyer_name" text,
  "weight_kg" numeric(10,2),
  "amount" numeric(12,2),
  "revenue_id" uuid,
  "revenue_created_here" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "animal_exits_positive_weight" CHECK ("animal_exits"."weight_kg" is null or "animal_exits"."weight_kg" > 0),
  CONSTRAINT "animal_exits_positive_amount" CHECK ("animal_exits"."amount" is null or "animal_exits"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_status_event_id_animal_status_events_id_fk" FOREIGN KEY ("status_event_id") REFERENCES "public"."animal_status_events"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_revenue_id_revenues_id_fk" FOREIGN KEY ("revenue_id") REFERENCES "public"."revenues"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_exits_status_event_unique" ON "animal_exits" USING btree ("status_event_id");
--> statement-breakpoint
CREATE INDEX "animal_exits_animal_idx" ON "animal_exits" USING btree ("animal_id");
--> statement-breakpoint

ALTER TABLE "attachments" ADD COLUMN "milk_collection_id" uuid;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "revenue_id" uuid;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "animal_exit_id" uuid;
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_single_parent";
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_milk_collection_id_milk_collections_id_fk" FOREIGN KEY ("milk_collection_id") REFERENCES "public"."milk_collections"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_revenue_id_revenues_id_fk" FOREIGN KEY ("revenue_id") REFERENCES "public"."revenues"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_animal_exit_id_animal_exits_id_fk" FOREIGN KEY ("animal_exit_id") REFERENCES "public"."animal_exits"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_single_parent" CHECK (num_nonnulls("purchase_id", "milk_session_id", "milk_collection_id", "revenue_id", "animal_exit_id") <= 1);
--> statement-breakpoint
CREATE INDEX "attachments_collection_idx" ON "attachments" USING btree ("milk_collection_id");
--> statement-breakpoint
CREATE INDEX "attachments_revenue_idx" ON "attachments" USING btree ("revenue_id");
--> statement-breakpoint
CREATE INDEX "attachments_exit_idx" ON "attachments" USING btree ("animal_exit_id");
