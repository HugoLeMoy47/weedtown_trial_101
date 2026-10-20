-- CreateTable
CREATE TABLE "Consentimiento" (
    "userId" INTEGER NOT NULL,
    "finalidad" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "otorgado" BOOLEAN NOT NULL,
    "decididoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consentimiento_pkey" PRIMARY KEY ("userId","finalidad")
);

-- AddForeignKey
ALTER TABLE "Consentimiento" ADD CONSTRAINT "Consentimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
