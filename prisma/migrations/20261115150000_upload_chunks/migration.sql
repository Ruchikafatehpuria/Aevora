-- CreateTable
CREATE TABLE "upload_chunks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_chunks_createdAt_idx" ON "upload_chunks"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "upload_chunks_userId_uploadId_index_key" ON "upload_chunks"("userId", "uploadId", "index");

