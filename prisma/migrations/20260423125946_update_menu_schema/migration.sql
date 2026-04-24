/*
  Warnings:

  - Added the required column `updatedAt` to the `menus` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MobileOperator" AS ENUM ('MTN', 'AIRTEL');

-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "operator" "MobileOperator",
ALTER COLUMN "phone" DROP NOT NULL;
