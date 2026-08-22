-- AlterTable: add isChild column to Guest (child tracking)
ALTER TABLE "Guest" ADD COLUMN "isChild" BOOLEAN NOT NULL DEFAULT false;