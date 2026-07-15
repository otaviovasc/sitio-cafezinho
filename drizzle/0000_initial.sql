CREATE TYPE "public"."animal_status" AS ENUM('ACTIVE', 'LACTATING', 'DRY', 'SOLD', 'DEAD', 'INACTIVE', 'UNKNOWN');
--> statement-breakpoint
CREATE TYPE "public"."milk_input_mode" AS ENUM('SEPARATE_MORNING_AFTERNOON', 'COMBINED_TOTAL', 'MIXED');
--> statement-breakpoint
CREATE TYPE "public"."milk_source" AS ENUM('MANUAL', 'CHATGPT_IMPORT', 'NOTEBOOK_SEED');
--> statement-breakpoint
CREATE TYPE "public"."measurement_confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW');
--> statement-breakpoint
CREATE TYPE "public"."measurement_status" AS ENUM('CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED');
--> statement-breakpoint
CREATE TYPE "public"."purchase_category" AS ENUM('FEED', 'MINERAL_SUPPLEMENT', 'MEDICINE', 'MILKING_AND_HYGIENE', 'MAINTENANCE', 'FUEL', 'ENERGY', 'ANIMAL_PURCHASE', 'OTHER');
--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('OPEN', 'PAID', 'CANCELLED');
--> statement-breakpoint
CREATE TYPE "public"."purchase_unit" AS ENUM('UNIT', 'KG', 'LITER', 'BAG', 'BOX', 'OTHER');
--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('LOCAL', 'GOOGLE_DRIVE');
--> statement-breakpoint
CREATE TYPE "public"."storage_status" AS ENUM('UPLOADING', 'AVAILABLE', 'FAILED', 'DELETED');
--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('INVOICE', 'BOLETO', 'PAYMENT_RECEIPT', 'MILK_NOTEBOOK', 'OTHER');
--> statement-breakpoint
CREATE TABLE "animals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "tag_number" text,
  "status" "animal_status" DEFAULT 'ACTIVE' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "animals_name_or_tag" CHECK ("animals"."name" is not null or "animals"."tag_number" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "animals_tag_number_unique" ON "animals" USING btree ("tag_number");
--> statement-breakpoint
CREATE INDEX "animals_name_idx" ON "animals" USING btree ("name");
--> statement-breakpoint
CREATE TABLE "animal_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "alias" text NOT NULL,
  "normalized_alias" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal_aliases" ADD CONSTRAINT "animal_aliases_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_aliases_animal_normalized_unique" ON "animal_aliases" USING btree ("animal_id", "normalized_alias");
--> statement-breakpoint
CREATE INDEX "animal_aliases_normalized_idx" ON "animal_aliases" USING btree ("normalized_alias");
--> statement-breakpoint
CREATE TABLE "milk_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_date" date NOT NULL,
  "title" text,
  "input_mode" "milk_input_mode" NOT NULL,
  "source" "milk_source" NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "milk_sessions_date_idx" ON "milk_sessions" USING btree ("session_date");
--> statement-breakpoint
CREATE TABLE "milk_measurements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "milk_session_id" uuid NOT NULL,
  "animal_id" uuid,
  "raw_animal_label" text NOT NULL,
  "raw_value_text" text,
  "morning_liters" numeric(10,2),
  "afternoon_liters" numeric(10,2),
  "total_liters" numeric(10,2) NOT NULL,
  "confidence" "measurement_confidence" NOT NULL,
  "status" "measurement_status" NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "milk_measurements_non_negative" CHECK ("milk_measurements"."total_liters" >= 0 and ("milk_measurements"."morning_liters" is null or "milk_measurements"."morning_liters" >= 0) and ("milk_measurements"."afternoon_liters" is null or "milk_measurements"."afternoon_liters" >= 0))
);
--> statement-breakpoint
ALTER TABLE "milk_measurements" ADD CONSTRAINT "milk_measurements_milk_session_id_milk_sessions_id_fk" FOREIGN KEY ("milk_session_id") REFERENCES "public"."milk_sessions"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "milk_measurements" ADD CONSTRAINT "milk_measurements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "milk_measurements_session_idx" ON "milk_measurements" USING btree ("milk_session_id");
--> statement-breakpoint
CREATE INDEX "milk_measurements_animal_idx" ON "milk_measurements" USING btree ("animal_id");
--> statement-breakpoint
CREATE TABLE "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");
--> statement-breakpoint
CREATE TABLE "purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid,
  "purchase_date" date NOT NULL,
  "description" text NOT NULL,
  "category" "purchase_category" NOT NULL,
  "gross_amount" numeric(12,2) NOT NULL,
  "discount_amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "freight_amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "total_amount" numeric(12,2) NOT NULL,
  "due_date" date,
  "paid_at" timestamp with time zone,
  "status" "purchase_status" DEFAULT 'OPEN' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchases_non_negative" CHECK ("purchases"."gross_amount" >= 0 and "purchases"."discount_amount" >= 0 and "purchases"."freight_amount" >= 0 and "purchases"."total_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("purchase_date");
--> statement-breakpoint
CREATE INDEX "purchases_due_idx" ON "purchases" USING btree ("due_date");
--> statement-breakpoint
CREATE TABLE "purchase_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purchase_id" uuid NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit" "purchase_unit" NOT NULL,
  "unit_price" numeric(12,2) NOT NULL,
  "total_price" numeric(12,2) NOT NULL,
  "notes" text
);
--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");
--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_non_negative" CHECK ("purchase_items"."quantity" >= 0 and "purchase_items"."unit_price" >= 0 and "purchase_items"."total_price" >= 0);
--> statement-breakpoint
CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" text NOT NULL,
  "storage_provider" "storage_provider" NOT NULL,
  "storage_file_id" text NOT NULL,
  "storage_folder_id" text,
  "storage_status" "storage_status" NOT NULL,
  "document_type" "document_type" NOT NULL,
  "purchase_id" uuid,
  "milk_session_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "attachments_single_parent" CHECK (not ("attachments"."purchase_id" is not null and "attachments"."milk_session_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_milk_session_id_milk_sessions_id_fk" FOREIGN KEY ("milk_session_id") REFERENCES "public"."milk_sessions"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "attachments_sha_idx" ON "attachments" USING btree ("sha256");
--> statement-breakpoint
CREATE INDEX "attachments_purchase_idx" ON "attachments" USING btree ("purchase_id");
--> statement-breakpoint
CREATE INDEX "attachments_session_idx" ON "attachments" USING btree ("milk_session_id");
