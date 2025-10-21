/*
  Warnings:

  - You are about to drop the column `properties` on the `Block` table. All the data in the column will be lost.
  - You are about to drop the column `coverImage` on the `Page` table. All the data in the column will be lost.
  - You are about to drop the column `isTemplate` on the `Page` table. All the data in the column will be lost.
  - You are about to drop the `AIMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AISession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."AIMessage" DROP CONSTRAINT "AIMessage_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AISession" DROP CONSTRAINT "AISession_pageId_fkey";

-- AlterTable
ALTER TABLE "Block" DROP COLUMN "properties",
ALTER COLUMN "type" SET DEFAULT 'text';

-- AlterTable
ALTER TABLE "Page" DROP COLUMN "coverImage",
DROP COLUMN "isTemplate";

-- DropTable
DROP TABLE "public"."AIMessage";

-- DropTable
DROP TABLE "public"."AISession";
