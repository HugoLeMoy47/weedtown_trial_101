-- AlterTable
ALTER TABLE "User" ADD COLUMN     "invitaciones" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visibilidadInvitaciones" "VisibilidadCampo" NOT NULL DEFAULT 'NADIE';
