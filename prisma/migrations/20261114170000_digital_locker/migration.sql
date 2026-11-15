-- CreateEnum
CREATE TYPE "OrganizeMode" AS ENUM ('AUTO', 'ASK', 'MANUAL');

-- CreateEnum
CREATE TYPE "FileSource" AS ENUM ('MANUAL_UPLOAD', 'WHATSAPP', 'SHARE_SHEET', 'EMAIL', 'GOOGLE_DRIVE', 'ONEDRIVE', 'DROPBOX', 'CAMERA_SCAN');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'DUPLICATE_PENDING');

-- CreateEnum
CREATE TYPE "OrganizationState" AS ENUM ('INBOX', 'SUGGESTED', 'ORGANIZED');

-- CreateEnum
CREATE TYPE "BatchKind" AS ENUM ('FILES', 'ZIP', 'WHATSAPP_CHAT', 'SHARE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "locker_settings" (
    "userId" TEXT NOT NULL,
    "organizeMode" "OrganizeMode" NOT NULL DEFAULT 'ASK',
    "aiReadsContent" BOOLEAN NOT NULL DEFAULT false,
    "autoApplyMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locker_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "batchId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" "FileSource" NOT NULL,
    "sourceDetail" TEXT,
    "originalPath" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'PROCESSING',
    "failureReason" TEXT,
    "organization" "OrganizationState" NOT NULL DEFAULT 'INBOX',
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "project" TEXT,
    "importance" TEXT,
    "documentDate" TIMESTAMP(3),
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "extractedText" TEXT,
    "pageTexts" JSONB,
    "suggestion" JSONB,
    "scanStatus" TEXT NOT NULL DEFAULT 'not_scanned',
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BatchKind" NOT NULL,
    "source" "FileSource" NOT NULL,
    "label" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_chat_archives" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "chatName" TEXT NOT NULL,
    "platformHint" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_chat_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "rawTimestamp" TEXT NOT NULL,
    "sender" TEXT,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_attachments" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "messageId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileId" TEXT,
    "missing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "whatsapp_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_processing_jobs" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchField" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "folders_userId_parentId_name_key" ON "folders"("userId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "file_categories_userId_name_key" ON "file_categories"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "imported_files_storageKey_key" ON "imported_files"("storageKey");

-- CreateIndex
CREATE INDEX "imported_files_userId_createdAt_idx" ON "imported_files"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "imported_files_userId_sha256_idx" ON "imported_files"("userId", "sha256");

-- CreateIndex
CREATE INDEX "imported_files_userId_folderId_idx" ON "imported_files"("userId", "folderId");

-- CreateIndex
CREATE INDEX "imported_files_userId_organization_idx" ON "imported_files"("userId", "organization");

-- CreateIndex
CREATE INDEX "import_batches_userId_createdAt_idx" ON "import_batches"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_chat_archives_batchId_key" ON "whatsapp_chat_archives"("batchId");

-- CreateIndex
CREATE INDEX "whatsapp_chat_archives_userId_idx" ON "whatsapp_chat_archives"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_archiveId_seq_idx" ON "whatsapp_messages"("archiveId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_attachments_fileId_key" ON "whatsapp_attachments"("fileId");

-- CreateIndex
CREATE INDEX "whatsapp_attachments_archiveId_idx" ON "whatsapp_attachments"("archiveId");

-- CreateIndex
CREATE INDEX "file_processing_jobs_status_createdAt_idx" ON "file_processing_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "organization_rules_userId_idx" ON "organization_rules"("userId");

-- AddForeignKey
ALTER TABLE "locker_settings" ADD CONSTRAINT "locker_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_categories" ADD CONSTRAINT "file_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_chat_archives" ADD CONSTRAINT "whatsapp_chat_archives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_chat_archives" ADD CONSTRAINT "whatsapp_chat_archives_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "whatsapp_chat_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attachments" ADD CONSTRAINT "whatsapp_attachments_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "whatsapp_chat_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attachments" ADD CONSTRAINT "whatsapp_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_attachments" ADD CONSTRAINT "whatsapp_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "imported_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "imported_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_rules" ADD CONSTRAINT "organization_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

