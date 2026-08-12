DO $$ BEGIN
  CREATE TYPE "InventoryCategory" AS ENUM ('INGREDIENT', 'PACKAGING', 'SUPPLY', 'PRODUCT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InventoryUnit" AS ENUM ('UNIT', 'KG', 'G', 'LITER', 'ML', 'BOX', 'PACK', 'BOTTLE', 'BAG');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "inventory_resources" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" "InventoryCategory" NOT NULL DEFAULT 'INGREDIENT',
  "unit" "InventoryUnit" NOT NULL DEFAULT 'UNIT',
  "stockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lowStockThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costPerUnit" DOUBLE PRECISION,
  "supplier" TEXT,
  "storageLocation" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventory_resources_businessId_idx" ON "inventory_resources"("businessId");
CREATE INDEX IF NOT EXISTS "inventory_resources_businessId_category_idx" ON "inventory_resources"("businessId", "category");

DO $$ BEGIN
  ALTER TABLE "inventory_resources"
    ADD CONSTRAINT "inventory_resources_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
