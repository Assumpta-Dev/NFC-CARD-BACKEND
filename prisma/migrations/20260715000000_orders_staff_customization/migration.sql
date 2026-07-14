-- AlterEnum: BusinessType + BAR
ALTER TYPE "BusinessType" ADD VALUE IF NOT EXISTS 'BAR';

-- AlterEnum: Role + STAFF
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';

-- AlterEnum: OrderContext + BAR_SEAT
ALTER TYPE "OrderContext" ADD VALUE IF NOT EXISTS 'BAR_SEAT';

-- CreateEnum PrepStatus
DO $$ BEGIN
  CREATE TYPE "PrepStatus" AS ENUM ('NONE', 'RECEIVED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum StaffRole
DO $$ BEGIN
  CREATE TYPE "StaffRole" AS ENUM ('ORDERS', 'MANAGER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- MenuItem customization fields
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "customizationHint" TEXT,
  ADD COLUMN IF NOT EXISTS "allowsSpecialInstructions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "customizationOptions" JSONB;

-- Order notes + prep status
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "prepStatus" "PrepStatus" NOT NULL DEFAULT 'NONE';

CREATE INDEX IF NOT EXISTS "orders_prepStatus_idx" ON "orders"("prepStatus");

-- Business staff portal users
CREATE TABLE IF NOT EXISTS "business_staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffRole" "StaffRole" NOT NULL DEFAULT 'ORDERS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_staff_businessId_userId_key" ON "business_staff"("businessId", "userId");
CREATE INDEX IF NOT EXISTS "business_staff_userId_idx" ON "business_staff"("userId");
CREATE INDEX IF NOT EXISTS "business_staff_businessId_idx" ON "business_staff"("businessId");

DO $$ BEGIN
  ALTER TABLE "business_staff"
    ADD CONSTRAINT "business_staff_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "business_staff"
    ADD CONSTRAINT "business_staff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
