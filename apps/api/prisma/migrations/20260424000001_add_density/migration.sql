-- AlterTable: add density column with default 3 (normal)
ALTER TABLE "Dungeon" ADD COLUMN "density" INTEGER NOT NULL DEFAULT 3;
