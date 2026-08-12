ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "sku" TEXT,
  ADD COLUMN IF NOT EXISTS "trackInventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stockQuantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;

UPDATE "menu_items"
SET "lowStockThreshold" = 5
WHERE "lowStockThreshold" IS NULL;
