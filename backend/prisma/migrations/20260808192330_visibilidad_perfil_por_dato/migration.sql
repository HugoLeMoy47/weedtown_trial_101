-- CreateEnum
CREATE TYPE "VisibilidadCampo" AS ENUM ('TODOS', 'AMIGOS', 'NADIE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "perfilPublico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibilidadAboutMe" "VisibilidadCampo" NOT NULL DEFAULT 'AMIGOS',
ADD COLUMN     "visibilidadAge" "VisibilidadCampo" NOT NULL DEFAULT 'NADIE',
ADD COLUMN     "visibilidadBio" "VisibilidadCampo" NOT NULL DEFAULT 'TODOS',
ADD COLUMN     "visibilidadGender" "VisibilidadCampo" NOT NULL DEFAULT 'NADIE';
