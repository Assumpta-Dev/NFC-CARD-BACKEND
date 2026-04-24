/*
  Warnings:

  - Added the required column `method` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MTN', 'AIRTEL');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "method" "PaymentMethod" NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
