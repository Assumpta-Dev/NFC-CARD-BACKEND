-- Stations / availability enums
DO $$ BEGIN
  CREATE TYPE "PrepStation" AS ENUM ('KITCHEN', 'BAR', 'FLOOR', 'ALL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ItemAvailability" AS ENUM ('ALL', 'HAPPY_HOUR', 'ROOM_SERVICE', 'DINE_IN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Menu item availability + station
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "availability" "ItemAvailability" NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "station" "PrepStation" NOT NULL DEFAULT 'KITCHEN';

-- Staff station
ALTER TABLE "business_staff"
  ADD COLUMN IF NOT EXISTS "station" "PrepStation" NOT NULL DEFAULT 'ALL';

-- Order enrichment
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "cartHash" TEXT,
  ADD COLUMN IF NOT EXISTS "estimatedWaitMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "rejectReasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectReason" TEXT;

CREATE INDEX IF NOT EXISTS "orders_businessId_phone_cartHash_idx"
  ON "orders"("businessId", "phone", "cartHash");

-- Audit trail
CREATE TABLE IF NOT EXISTS "order_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_events_orderId_createdAt_idx"
  ON "order_events"("orderId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "order_events"
    ADD CONSTRAINT "order_events_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Guest favorites / reorder
CREATE TABLE IF NOT EXISTS "guest_favorites" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "customerName" TEXT,
  "items" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_favorites_businessId_phone_key"
  ON "guest_favorites"("businessId", "phone");
CREATE INDEX IF NOT EXISTS "guest_favorites_businessId_phone_idx"
  ON "guest_favorites"("businessId", "phone");

DO $$ BEGIN
  ALTER TABLE "guest_favorites"
    ADD CONSTRAINT "guest_favorites_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
