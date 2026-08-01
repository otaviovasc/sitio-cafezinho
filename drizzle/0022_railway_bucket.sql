ALTER TYPE "public"."storage_provider" RENAME VALUE 'GOOGLE_DRIVE' TO 'RAILWAY_BUCKET';
--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "storage_folder_id";
