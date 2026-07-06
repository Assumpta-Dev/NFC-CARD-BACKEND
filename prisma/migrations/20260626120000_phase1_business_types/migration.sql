-- Phase 1: business types, settings JSON, order table/room context

CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'HOTEL', 'MOTEL', 'CAFE', 'OTHER');
CREATE TYPE "OrderContext" AS ENUM ('TABLE', 'ROOM');

ALTER TABLE "business_profiles"
  ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT',
  ADD COLUMN "settings" JSONB;

UPDATE "business_profiles"
SET "businessType" = CASE
  WHEN LOWER("category") IN ('hotel', 'hotels') THEN 'HOTEL'::"BusinessType"
  WHEN LOWER("category") IN ('motel', 'motels') THEN 'MOTEL'::"BusinessType"
  WHEN LOWER("category") IN ('cafe', 'café', 'coffee') THEN 'CAFE'::"BusinessType"
  WHEN LOWER("category") IN ('restaurant', 'restaurants', 'food') THEN 'RESTAURANT'::"BusinessType"
  ELSE 'OTHER'::"BusinessType"
END;

ALTER TABLE "orders"
  ADD COLUMN "orderContext" "OrderContext" NOT NULL DEFAULT 'TABLE',
  ADD COLUMN "tableNumber" TEXT,
  ADD COLUMN "roomNumber" TEXT;

-- Backfill room/table from legacy customerName suffix e.g. "Jane (Room 204)"
UPDATE "orders"
SET
  "orderContext" = 'ROOM'::"OrderContext",
  "roomNumber" = SUBSTRING("customerName" FROM '\(Room ([^)]+)\)')
WHERE "customerName" ~ '\(Room [^)]+\)';

UPDATE "orders"
SET
  "orderContext" = 'TABLE'::"OrderContext",
  "tableNumber" = SUBSTRING("customerName" FROM '\(Table ([^)]+)\)')
WHERE "customerName" ~ '\(Table [^)]+\)';
