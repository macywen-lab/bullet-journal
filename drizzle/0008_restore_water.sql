-- Recover the built-in tracker if the previous Settings page left its section empty.
UPDATE habits AS water
SET removed=0, active=1, amount=400
WHERE water.id='00000000-0000-4000-8000-000000000001' AND water.removed=1
  AND NOT EXISTS (
    SELECT 1 FROM habits AS existing
    WHERE existing.owner=water.owner AND existing.kind='water' AND existing.removed=0
  );
