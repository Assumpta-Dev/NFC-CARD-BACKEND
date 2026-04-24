/*
  Warnings:

  - You are about to drop the column `endsAt` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `paymentId` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `Subscription` table. All the data in the column will be lost.
  - Added the required column `billingCycle` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endDate` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `status` on the `Subscription` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "endsAt",
DROP COLUMN "paymentId",
DROP COLUMN "startsAt",
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL;

-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "businessProfileId" TEXT;

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "cards_businessProfileId_idx" ON "cards"("businessProfileId");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'BUSINESS'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'BUSINESS';
  END IF;
END $$;