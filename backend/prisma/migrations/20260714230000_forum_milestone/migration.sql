-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REPLY_POST', 'REPLY_COMMENT', 'NEW_SUBFORUM_POST');

-- DropForeignKey
ALTER TABLE "ForumPost" DROP CONSTRAINT "ForumPost_categoryId_fkey";

-- AlterTable
ALTER TABLE "ForumPost" DROP COLUMN "categoryId",
ADD COLUMN     "image" TEXT,
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subforumId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Reaction" ADD COLUMN     "forumCommentId" INTEGER,
ADD COLUMN     "forumPostId" INTEGER;

-- DropTable
DROP TABLE "ForumCategory";

-- CreateTable
CREATE TABLE "SubForum" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubForum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubForumFollow" (
    "userId" INTEGER NOT NULL,
    "subforumId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubForumFollow_pkey" PRIMARY KEY ("userId","subforumId")
);

-- CreateTable
CREATE TABLE "ForumComment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "authorId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "subforumId" INTEGER,
    "forumPostId" INTEGER,
    "forumCommentId" INTEGER,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubForum_name_key" ON "SubForum"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubForum_slug_key" ON "SubForum"("slug");

-- CreateIndex
CREATE INDEX "ForumComment_postId_parentId_idx" ON "ForumComment"("postId", "parentId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "ForumPost_subforumId_createdAt_idx" ON "ForumPost"("subforumId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_subforumId_score_idx" ON "ForumPost"("subforumId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_forumPostId_key" ON "Reaction"("userId", "forumPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_forumCommentId_key" ON "Reaction"("userId", "forumCommentId");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_forumPostId_fkey" FOREIGN KEY ("forumPostId") REFERENCES "ForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_forumCommentId_fkey" FOREIGN KEY ("forumCommentId") REFERENCES "ForumComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubForum" ADD CONSTRAINT "SubForum_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubForumFollow" ADD CONSTRAINT "SubForumFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubForumFollow" ADD CONSTRAINT "SubForumFollow_subforumId_fkey" FOREIGN KEY ("subforumId") REFERENCES "SubForum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_subforumId_fkey" FOREIGN KEY ("subforumId") REFERENCES "SubForum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ForumComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_subforumId_fkey" FOREIGN KEY ("subforumId") REFERENCES "SubForum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_forumPostId_fkey" FOREIGN KEY ("forumPostId") REFERENCES "ForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_forumCommentId_fkey" FOREIGN KEY ("forumCommentId") REFERENCES "ForumComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

