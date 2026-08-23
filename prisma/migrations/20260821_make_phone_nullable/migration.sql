-- AlterTable: make phone column nullable (children don't need a phone)
ALTER TABLE "Guest" ALTER COLUMN "phone" DROP NOT NULL;