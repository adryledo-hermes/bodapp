-- Add optional Decoration -> Table attachment (centerpieces live WITH their table)
ALTER TABLE "Decoration" ADD COLUMN "tableId" TEXT;
CREATE INDEX "Decoration_tableId_idx" ON "Decoration"("tableId");