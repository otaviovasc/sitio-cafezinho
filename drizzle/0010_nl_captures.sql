CREATE TYPE "public"."capture_input_kind" AS ENUM('AUDIO', 'DOCUMENT', 'TEXT');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('PROCESSING', 'NEEDS_REVIEW', 'REVIEWED', 'FAILED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."proposed_action_type" AS ENUM('DAILY_MILK_TOTAL', 'INDIVIDUAL_MILK_SESSION', 'MILK_COLLECTION', 'MASTITIS_CASE', 'PURCHASE', 'REVENUE', 'WEIGHT_SESSION', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."proposed_action_commit_status" AS ENUM('READY', 'NEEDS_REVIEW', 'NEEDS_PERIOD', 'UNREPRESENTABLE');--> statement-breakpoint
CREATE TYPE "public"."proposed_action_status" AS ENUM('NEEDS_REVIEW', 'CONFIRMED', 'DISMISSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_kind" "capture_input_kind" NOT NULL,
	"status" "capture_status" DEFAULT 'PROCESSING' NOT NULL,
	"transcript" text,
	"stt_raw" jsonb,
	"ocr_summary" text,
	"interpret_raw" jsonb,
	"document_attachment_id" uuid,
	"stt_model" text,
	"interpret_model" text,
	"tokens_used" integer,
	"cost_cents" numeric(12, 4),
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"action_type" "proposed_action_type" NOT NULL,
	"raw_intent" jsonb,
	"resolved_payload" jsonb,
	"issues" jsonb,
	"commit_status" "proposed_action_commit_status" DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"status" "proposed_action_status" DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"committed_record_type" text,
	"committed_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_document_attachment_id_attachments_id_fk" FOREIGN KEY ("document_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_actions" ADD CONSTRAINT "proposed_actions_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captures_created_idx" ON "captures" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "captures_status_idx" ON "captures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proposed_actions_capture_idx" ON "proposed_actions" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "proposed_actions_status_idx" ON "proposed_actions" USING btree ("status");
