-- Cobertura vinculada a touro cadastrado. bull_name (texto) permanece para
-- registros antigos e touros não cadastrados; nunca vira vínculo por similaridade.
ALTER TABLE "animal_reproductive_events" ADD COLUMN "bull_id" uuid;
--> statement-breakpoint
ALTER TABLE "animal_reproductive_events" ADD CONSTRAINT "animal_reproductive_events_bull_id_animals_id_fk" FOREIGN KEY ("bull_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "animal_reproductive_events_bull_idx" ON "animal_reproductive_events" USING btree ("bull_id");
--> statement-breakpoint
ALTER TABLE "animal_reproductive_events" DROP CONSTRAINT "animal_reproductive_events_shape";
--> statement-breakpoint
ALTER TABLE "animal_reproductive_events" ADD CONSTRAINT "animal_reproductive_events_shape" CHECK (
	("type" = 'CALVING' and "had_breeding" = false and "bull_id" is null and "bull_name" is null and "outcome" is null and "outcome_recorded_on" is null)
	or
	("type" = 'HEAT' and (
		("had_breeding" = false and "bull_id" is null and "bull_name" is null and "outcome" is null and "outcome_recorded_on" is null)
		or
		("had_breeding" = true and "outcome" is not null)
	))
);
