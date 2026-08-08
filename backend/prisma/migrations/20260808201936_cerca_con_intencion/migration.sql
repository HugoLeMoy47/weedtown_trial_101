-- CreateEnum
CREATE TYPE "IntencionCerca" AS ENUM ('ROLAR', 'CONECTAR', 'MIRANDO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nearbyIntent" "IntencionCerca",
ADD COLUMN     "nearbyIntentUntil" TIMESTAMP(3);
