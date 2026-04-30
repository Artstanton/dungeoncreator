-- Add building support to Dungeon table
ALTER TABLE "Dungeon" ADD COLUMN "structureType" TEXT NOT NULL DEFAULT 'dungeon';
ALTER TABLE "Dungeon" ADD COLUMN "buildingType" TEXT;
