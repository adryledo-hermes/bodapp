-- Add purpose tag to photos: "gallery" (Upload-photo button / future guest
-- uploads), "profile", "invitation". The photos panel shows only gallery rows.
-- Existing rows default to gallery (they were all panel uploads before the
-- profile/invitation flows started tagging).

ALTER TABLE "Photo" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'gallery';
