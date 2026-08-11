-- CreateTable
CREATE TABLE "ConteoAtribucion" (
    "id" SERIAL NOT NULL,
    "dia" DATE NOT NULL,
    "resultado" TEXT NOT NULL,
    "conteo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConteoAtribucion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConteoAtribucion_dia_resultado_key" ON "ConteoAtribucion"("dia", "resultado");
