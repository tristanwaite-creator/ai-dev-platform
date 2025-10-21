-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buildStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "column" TEXT NOT NULL DEFAULT 'research',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "researchSummary" JSONB;

-- CreateTable
CREATE TABLE "ResearchMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "ResearchMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchMessage_taskId_idx" ON "ResearchMessage"("taskId");

-- CreateIndex
CREATE INDEX "ResearchMessage_createdAt_idx" ON "ResearchMessage"("createdAt");

-- CreateIndex
CREATE INDEX "Task_column_idx" ON "Task"("column");

-- AddForeignKey
ALTER TABLE "ResearchMessage" ADD CONSTRAINT "ResearchMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
