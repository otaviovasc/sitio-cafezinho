ALTER TABLE "planting_inputs" ADD COLUMN "feed_item_id" uuid;--> statement-breakpoint
ALTER TABLE "planting_inputs" ADD CONSTRAINT "planting_inputs_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planting_inputs_feed_item_idx" ON "planting_inputs" USING btree ("feed_item_id");
