ALTER TABLE "room_types" ADD COLUMN "nightly_price" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT INTO "properties" ("id", "name", "timezone", "currency")
VALUES ('00000000-0000-4000-8000-000000000001', 'Reservo Taipei', 'Asia/Taipei', 'TWD')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "room_types" ("id", "property_id", "name", "description", "max_guests", "nightly_price")
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Sunroom', 'A simple, just-right room.', 2, 4200),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Garden room', 'A room opening onto green space.', 2, 5800),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Blank-space suite', 'A little more space and time.', 4, 8600)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "room_inventory" ("room_type_id", "stay_date", "total_quantity")
SELECT room_type_id, stay_date, 5
FROM unnest(ARRAY[
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid
]) AS room_types(room_type_id)
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '730 days', INTERVAL '1 day') AS dates(stay_date)
ON CONFLICT ("room_type_id", "stay_date") DO NOTHING;
