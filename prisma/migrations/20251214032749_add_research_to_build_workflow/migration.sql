/*
  Warnings:

  - You are about to drop the column `outputPath` on the `Generation` table. All the data in the column will be lost.
  - You are about to drop the column `agentStatus` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `approved` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `assignedAgent` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `rejectionReason` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Generation" DROP COLUMN "outputPath";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "agentStatus",
DROP COLUMN "approved",
DROP COLUMN "assignedAgent",
DROP COLUMN "rejectionReason",
ADD COLUMN     "agentSessionId" TEXT,
ADD COLUMN     "synthesizedPrompt" TEXT;

-- CreateIndex
CREATE INDEX "Task_agentSessionId_idx" ON "Task"("agentSessionId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
