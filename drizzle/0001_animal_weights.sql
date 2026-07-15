CREATE TABLE "animal_weights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "animal_id" uuid NOT NULL,
  "measured_at" timestamp with time zone NOT NULL,
  "weight_kg" numeric(10,2) NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "animal_weights_positive" CHECK ("animal_weights"."weight_kg" > 0)
);
--> statement-breakpoint
ALTER TABLE "animal_weights" ADD CONSTRAINT "animal_weights_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "animal_weights_animal_date_idx" ON "animal_weights" USING btree ("animal_id", "measured_at");
