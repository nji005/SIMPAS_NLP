-- AlterTable
ALTER TABLE `Laporan` 
    ADD COLUMN `tanggalKejadian` DATETIME(3) NULL,
    ADD COLUMN `kategoriPrediksi` VARCHAR(191) NULL,
    ADD COLUMN `confidenceScore` DOUBLE NULL;
