-- AlterTable
ALTER TABLE "User" ADD COLUMN "ultimaActividadDia" DATE;

-- CreateTable
CREATE TABLE "ConteoActividad" (
    "dia" DATE NOT NULL,
    "conteo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConteoActividad_pkey" PRIMARY KEY ("dia")
);
