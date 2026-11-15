-- DropIndex
DROP INDEX "whatsapp_attachments_fileId_key";

-- CreateIndex
CREATE INDEX "whatsapp_attachments_fileId_idx" ON "whatsapp_attachments"("fileId");

