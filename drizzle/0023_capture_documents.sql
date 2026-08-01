CREATE TABLE "capture_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capture_id" uuid NOT NULL,
  "ordinal" integer NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" text NOT NULL,
  "ocr_text" text,
  "ocr_raw" jsonb,
  "ocr_model" text,
  "ocr_status" text DEFAULT 'PENDING' NOT NULL,
  "attachment_id" uuid,
  "storage_status" "storage_status" DEFAULT 'UPLOADING' NOT NULL,
  "storage_warning" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "capture_documents_ordinal_positive" CHECK ("capture_documents"."ordinal" > 0),
  CONSTRAINT "capture_documents_ocr_status_valid" CHECK ("capture_documents"."ocr_status" in ('PENDING', 'AVAILABLE', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "capture_documents" ADD CONSTRAINT "capture_documents_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "capture_documents" ADD CONSTRAINT "capture_documents_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "capture_documents_capture_ordinal_unique" ON "capture_documents" USING btree ("capture_id", "ordinal");
--> statement-breakpoint
CREATE INDEX "capture_documents_capture_idx" ON "capture_documents" USING btree ("capture_id");
--> statement-breakpoint
CREATE INDEX "capture_documents_attachment_idx" ON "capture_documents" USING btree ("attachment_id");
