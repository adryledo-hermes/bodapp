-- Add manual "sent" tracking to Invitation (set from the Invitations panel).
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "sent" BOOLEAN NOT NULL DEFAULT false;