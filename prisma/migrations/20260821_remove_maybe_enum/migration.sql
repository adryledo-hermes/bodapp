-- AlterEnum: remove 'maybe' from RSVPStatus, migrate existing rows to 'pending'
BEGIN;
ALTER TYPE "RSVPStatus" RENAME TO "RSVPStatus_old";
CREATE TYPE "RSVPStatus" AS ENUM ('pending', 'confirmed', 'declined');
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" DROP DEFAULT;
UPDATE "Guest" SET "rsvpStatus" = 'pending' WHERE "rsvpStatus" = 'maybe';
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" TYPE "RSVPStatus" USING ("rsvpStatus"::text::"RSVPStatus");
DROP TYPE "RSVPStatus_old";
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" SET DEFAULT 'pending';
COMMIT;