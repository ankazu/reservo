ALTER TABLE "room_types" ADD COLUMN "code" text;--> statement-breakpoint
UPDATE "room_types"
SET "code" = CASE "id"
  WHEN '00000000-0000-4000-8000-000000000101'::uuid THEN 'sunroom'
  WHEN '00000000-0000-4000-8000-000000000102'::uuid THEN 'garden-room'
  WHEN '00000000-0000-4000-8000-000000000103'::uuid THEN 'blank-space-suite'
  ELSE 'legacy-' || "id"::text
END;--> statement-breakpoint
ALTER TABLE "room_types" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_code_unique" UNIQUE("code");
