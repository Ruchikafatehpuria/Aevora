-- AlterTable
ALTER TABLE "imported_files" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "imported_files_userId_deletedAt_idx" ON "imported_files"("userId", "deletedAt");

