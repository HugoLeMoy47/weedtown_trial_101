-- Ciclo 9C: los hashtags conservan la grafía con la que se escribieron.
--
-- ESTRICTAMENTE ADITIVA: solo agrega una columna. No borra, no renombra y no
-- toca "tag" (la llave de agrupación en minúsculas) ni ninguna fila de
-- HashtagOnPost. Revertirla es un DROP COLUMN y nada más.
--
-- Va en tres pasos a propósito. El SQL que Prisma genera solo para una columna
-- requerida es `ADD COLUMN "displayTag" TEXT NOT NULL`, que en una tabla CON
-- FILAS falla en seco (no hay valor para las que ya están). Así que:
--   1. se agrega admitiendo NULL, que nunca falla;
--   2. se rellenan las filas existentes con su propio `tag` — o sea, se quedan
--      en minúsculas. La grafía original de esos hashtags se perdió antes de
--      que esta columna existiera y no hay de dónde recuperarla; fingir lo
--      contrario (adivinar mayúsculas) sería peor que aceptarlo;
--   3. recién entonces se exige NOT NULL, que es como queda declarada en
--      schema.prisma.

-- AlterTable
ALTER TABLE "Hashtag" ADD COLUMN "displayTag" TEXT;

UPDATE "Hashtag" SET "displayTag" = "tag" WHERE "displayTag" IS NULL;

ALTER TABLE "Hashtag" ALTER COLUMN "displayTag" SET NOT NULL;
