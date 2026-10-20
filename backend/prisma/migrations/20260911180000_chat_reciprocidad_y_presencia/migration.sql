-- AlterTable
ALTER TABLE "Message" ADD COLUMN "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "confirmacionesLectura" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mostrarEnLinea" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Message_chatId_readAt_idx" ON "Message"("chatId", "readAt");
