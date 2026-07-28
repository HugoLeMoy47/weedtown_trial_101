-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'ACOSO', 'ODIO', 'ILEGAL', 'DESINFORMACION', 'SEXUAL', 'SUPLANTACION', 'OTRO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDIENTE', 'ACCIONADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('POST', 'COMMENT', 'FORUM_POST', 'FORUM_COMMENT', 'USER', 'SUBFORUM');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('OCULTAR', 'MOSTRAR', 'SUSPENDER', 'LEVANTAR_SUSPENSION', 'ARCHIVAR_SUBFORO', 'RESTAURAR_SUBFORO', 'RENOMBRAR_SUBFORO', 'DESCARTAR_REPORTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONTENIDO_OCULTO';
ALTER TYPE "NotificationType" ADD VALUE 'CUENTA_SUSPENDIDA';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" INTEGER,
ADD COLUMN     "hiddenReason" "ReportReason";

-- AlterTable
ALTER TABLE "ForumComment" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" INTEGER,
ADD COLUMN     "hiddenReason" "ReportReason";

-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" INTEGER,
ADD COLUMN     "hiddenReason" "ReportReason";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "reason" "ReportReason";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" INTEGER,
ADD COLUMN     "hiddenReason" "ReportReason";

-- AlterTable
ALTER TABLE "SubForum" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedById" INTEGER,
ADD COLUMN     "suspendedReason" "ReportReason",
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT,
    "postId" INTEGER,
    "commentId" INTEGER,
    "forumPostId" INTEGER,
    "forumCommentId" INTEGER,
    "targetUserId" INTEGER,
    "subforumId" INTEGER,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDIENTE',
    "resolvedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" SERIAL NOT NULL,
    "moderatorId" INTEGER NOT NULL,
    "type" "ModerationActionType" NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" INTEGER NOT NULL,
    "reason" "ReportReason",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_postId_key" ON "Report"("reporterId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_commentId_key" ON "Report"("reporterId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_forumPostId_key" ON "Report"("reporterId", "forumPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_forumCommentId_key" ON "Report"("reporterId", "forumCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetUserId_key" ON "Report"("reporterId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_subforumId_key" ON "Report"("reporterId", "subforumId");

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ForumPost_hiddenAt_idx" ON "ForumPost"("hiddenAt");

-- CreateIndex
CREATE INDEX "Post_hiddenAt_createdAt_idx" ON "Post"("hiddenAt", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubForum" ADD CONSTRAINT "SubForum_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_forumPostId_fkey" FOREIGN KEY ("forumPostId") REFERENCES "ForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_forumCommentId_fkey" FOREIGN KEY ("forumCommentId") REFERENCES "ForumComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_subforumId_fkey" FOREIGN KEY ("subforumId") REFERENCES "SubForum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
