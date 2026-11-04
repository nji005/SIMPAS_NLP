-- CreateIndex
CREATE INDEX `Laporan_status_idx` ON `Laporan`(`status`);

-- CreateIndex
CREATE INDEX `Laporan_createdAt_idx` ON `Laporan`(`createdAt`);

-- CreateIndex
CREATE INDEX `Laporan_kategori_idx` ON `Laporan`(`kategori`);

-- CreateIndex
CREATE INDEX `Laporan_userId_createdAt_idx` ON `Laporan`(`userId`, `createdAt`);
