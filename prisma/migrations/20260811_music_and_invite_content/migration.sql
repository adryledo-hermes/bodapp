-- Music split: Guest.favoriteSong (free text) — musicPrefs now means GENRES.
ALTER TABLE "Guest" ADD COLUMN "favoriteSong" TEXT;

-- Per-invitation personalization (frame/image/text overrides; null = template)
ALTER TABLE "Invitation" ADD COLUMN "content" JSONB;