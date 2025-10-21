-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "commitSha" TEXT,
ADD COLUMN     "commitUrl" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "githubRepoName" TEXT,
ADD COLUMN     "githubRepoOwner" TEXT;
