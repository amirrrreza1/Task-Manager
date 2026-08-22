-- Give every user a persistent avatar color, assigned at creation.

ALTER TABLE "User" ADD COLUMN "color" VARCHAR(9);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "User"
)
UPDATE "User" AS u
SET "color" = (ARRAY[
  '#2563EB',
  '#0284C7',
  '#059669',
  '#10B981',
  '#7C3AED',
  '#C026D3',
  '#E11D48',
  '#EA580C',
  '#D97706',
  '#64748B'
]::text[])[1 + ((r.rn - 1) % 10)]
FROM ranked AS r
WHERE u.id = r.id;

ALTER TABLE "User" ALTER COLUMN "color" SET NOT NULL;
