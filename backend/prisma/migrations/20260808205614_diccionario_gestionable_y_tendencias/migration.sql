-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModerationActionType" ADD VALUE 'AGREGAR_PALABRA_DESCARTADA';
ALTER TYPE "ModerationActionType" ADD VALUE 'QUITAR_PALABRA_DESCARTADA';

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'HASHTAG';

-- CreateTable
CREATE TABLE "PalabraDescartada" (
    "id" SERIAL NOT NULL,
    "palabra" TEXT NOT NULL,
    "agregadaPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PalabraDescartada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PalabraDescartada_palabra_key" ON "PalabraDescartada"("palabra");

-- AddForeignKey
ALTER TABLE "PalabraDescartada" ADD CONSTRAINT "PalabraDescartada_agregadaPorId_fkey" FOREIGN KEY ("agregadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Semilla del diccionario (ciclo 10D).
--
-- La lista que el ciclo 9C dejó cableada en src/lib/diccionarioDescarte.js se
-- vuelca aquí para que mover el almacenamiento NO pierda lo que ya se había
-- decidido: preposiciones dictadas por el PO, más artículos y conjunciones.
-- Las palabras van ya normalizadas (minúsculas, sin acentos), que es la forma
-- en que el módulo compara.
--
-- ON CONFLICT porque la migración debe poder correr sobre una base que ya
-- tenga alguna de estas palabras, sin abortar.
INSERT INTO "PalabraDescartada" ("palabra") VALUES ('a'), ('al'), ('ante'), ('bajo'), ('cabe'), ('con'), ('contra'), ('de'), ('del'), ('desde'), ('e'), ('el'), ('en'), ('entre'), ('hacia'), ('hasta'), ('la'), ('las'), ('lo'), ('los'), ('ni'), ('o'), ('para'), ('por'), ('que'), ('segun'), ('sin'), ('so'), ('sobre'), ('tras'), ('u'), ('un'), ('una'), ('unas'), ('unos'), ('y')
ON CONFLICT ("palabra") DO NOTHING;
