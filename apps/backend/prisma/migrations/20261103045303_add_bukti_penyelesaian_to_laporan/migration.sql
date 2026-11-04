-- AlterTable
ALTER TABLE `Laporan` ADD COLUMN `catatanSelesai` TEXT NULL,
    ADD COLUMN `fotoSelesai` VARCHAR(191) NULL,
    ADD COLUMN `selesaiAt` DATETIME(3) NULL;
