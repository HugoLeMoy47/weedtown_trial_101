-- AlterTable
ALTER TABLE "User" ADD COLUMN "ultimoCorreoDia" DATE;

-- CreateTable
CREATE TABLE "ConteoCorreo" (
    "dia" DATE NOT NULL,
    "conteo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConteoCorreo_pkey" PRIMARY KEY ("dia")
);
