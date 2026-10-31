-- Account security (v1.4): email validation on signup + password recovery.
-- Emails carry single-use tokens; only the SHA-256 hash of the token is stored.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Backfill: accounts registered before validation existed are treated as
-- verified, so turning on EMAIL_VERIFICATION_REQUIRED never locks anyone out.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

-- CreateEnum
CREATE TYPE "AuthEmailTokenKind" AS ENUM ('verify_email', 'password_reset');

-- CreateTable
CREATE TABLE "AuthEmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AuthEmailTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthEmailToken_tokenHash_idx" ON "AuthEmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthEmailToken_userId_kind_idx" ON "AuthEmailToken"("userId", "kind");

-- AddForeignKey
ALTER TABLE "AuthEmailToken" ADD CONSTRAINT "AuthEmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
