/*
  Warnings:

  - You are about to drop the column `description` on the `menus` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `menus` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `menus` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `menus` table. All the data in the column will be lost.
  - Added the required column `billingCycle` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plan` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'PLUS', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "menus" DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "position",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL,
ADD COLUMN     "plan" "PlanType" NOT NULL;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL,
    "status" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "paymentId" TEXT NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
