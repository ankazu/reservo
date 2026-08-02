INSERT INTO "rooms" ("id", "room_type_id", "name")
SELECT gen_random_uuid(), room_type_id, 'Room ' || room_number
FROM unnest(ARRAY[
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid
]) AS room_types(room_type_id)
CROSS JOIN generate_series(1, 5) AS rooms(room_number)
WHERE NOT EXISTS (
  SELECT 1
  FROM "rooms" existing
  WHERE existing.room_type_id = room_types.room_type_id
    AND existing.name = 'Room ' || room_number
);
