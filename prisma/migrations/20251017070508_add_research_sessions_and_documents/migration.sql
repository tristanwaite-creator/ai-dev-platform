-- AlterTable
ALTER TABLE "ResearchMessage" ADD COLUMN     "sessionId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'research',
    "status" TEXT NOT NULL DEFAULT 'active',
    "documentTitle" TEXT,
    "documentContent" TEXT,
    "documentFormat" TEXT DEFAULT 'markdown',
    "convertedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "exported" BOOLEAN NOT NULL DEFAULT false,
    "exportPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "ResearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchSession_projectId_idx" ON "ResearchSession"("projectId");

-- CreateIndex
CREATE INDEX "ResearchSession_status_idx" ON "ResearchSession"("status");

-- CreateIndex
CREATE INDEX "ResearchSession_createdAt_idx" ON "ResearchSession"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchDocument_sessionId_idx" ON "ResearchDocument"("sessionId");

-- CreateIndex
CREATE INDEX "ResearchDocument_createdAt_idx" ON "ResearchDocument"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchMessage_sessionId_idx" ON "ResearchMessage"("sessionId");

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchDocument" ADD CONSTRAINT "ResearchDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchMessage" ADD CONSTRAINT "ResearchMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
