-- CreateTable
CREATE TABLE "HandleReservado" (
    "handle" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "hastaAt" TIMESTAMP(3) NOT NULL,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandleReservado_pkey" PRIMARY KEY ("handle")
);

-- CreateIndex
CREATE INDEX "HandleReservado_userId_idx" ON "HandleReservado"("userId");

-- CreateIndex
CREATE INDEX "HandleReservado_hastaAt_idx" ON "HandleReservado"("hastaAt");

-- AddForeignKey
ALTER TABLE "HandleReservado" ADD CONSTRAINT "HandleReservado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
