-- Desacopla la identidad de Mastodon y le da a WeedTown un handle propio.
--
-- El orden importa: primero se crea todo lo nuevo, luego se rellena a partir de
-- lo viejo, y solo al final se borran las columnas de origen. Escrita a mano
-- porque una migración generada dropearía las columnas antes de copiarlas.

-- 1. Proveedores de acceso. Por ahora solo Mastodon; la etapa 2 agrega
--    PASSKEY y EMAIL sin tocar nada de lo de abajo.
CREATE TYPE "AuthProvider" AS ENUM ('MASTODON');

-- 2. Cómo entra una persona, separado de quién es
CREATE TABLE "Identity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "instance" TEXT,
    "originHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Identity_provider_externalId_key" ON "Identity"("provider", "externalId");
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. El handle nace nulo para poder rellenarlo antes de exigirlo
ALTER TABLE "User" ADD COLUMN "handle" TEXT;

-- 4. Cada cuenta existente se convierte en una identidad de Mastodon.
--    El externalId conserva exactamente el par que antes era el único compuesto.
INSERT INTO "Identity" ("userId", "provider", "externalId", "instance", "originHandle", "createdAt")
SELECT "id", 'MASTODON', "mastodonInstance" || ':' || "mastodonId",
       "mastodonInstance", "acct", "createdAt"
FROM "User";

-- 5. Handle a partir del acct de Mastodon: se toma la parte local, se limpia a
--    [a-z0-9_] y se recorta a 20. Si al limpiar queda muy corto se usa un
--    respaldo con el id. Las colisiones se numeran por orden de antigüedad, así
--    que la cuenta más vieja se queda con el handle limpio.
WITH limpio AS (
    SELECT "id",
           COALESCE(
             NULLIF(LEFT(REGEXP_REPLACE(LOWER(SPLIT_PART("acct", '@', 1)), '[^a-z0-9_]', '', 'g'), 20), ''),
             'wt'
           ) AS base
    FROM "User"
),
ajustado AS (
    SELECT "id",
           CASE WHEN LENGTH(base) < 3 THEN 'wt' || "id" ELSE base END AS base
    FROM limpio
),
numerado AS (
    SELECT "id", base,
           ROW_NUMBER() OVER (PARTITION BY base ORDER BY "id") AS n
    FROM ajustado
)
UPDATE "User" u
SET "handle" = CASE WHEN nu.n = 1 THEN nu.base ELSE nu.base || nu.n END
FROM numerado nu
WHERE u."id" = nu."id";

-- 6. Ya relleno, el handle pasa a ser obligatorio y único
ALTER TABLE "User" ALTER COLUMN "handle" SET NOT NULL;
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- 7. Fuera lo viejo: la identidad ya no vive en User
DROP INDEX IF EXISTS "User_mastodonInstance_mastodonId_key";
ALTER TABLE "User" DROP COLUMN "mastodonInstance";
ALTER TABLE "User" DROP COLUMN "mastodonId";
ALTER TABLE "User" DROP COLUMN "acct";
