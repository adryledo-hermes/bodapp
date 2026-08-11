-- Add optional Guest -> Invitation grouping (a personalised invitation
-- addresses a manual group of guests; their phones form acceptedPhones)
ALTER TABLE "Guest" ADD COLUMN "invitationId" TEXT;
CREATE INDEX "Guest_invitationId_idx" ON "Guest"("invitationId");