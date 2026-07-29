-- CreateEnum
CREATE TYPE "PrivacyActionType" AS ENUM ('EXPORTAR_DATOS', 'ELIMINAR_CUENTA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PrivacyAction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "PrivacyActionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyAction_userId_idx" ON "PrivacyAction"("userId");

-- AddForeignKey
ALTER TABLE "PrivacyAction" ADD CONSTRAINT "PrivacyAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
