-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `nik` VARCHAR(16) NOT NULL,
    `nama` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('WARGA', 'ADMIN') NOT NULL DEFAULT 'WARGA',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_nik_key`(`nik`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Laporan` (
    `id` VARCHAR(191) NOT NULL,
    `judul` VARCHAR(191) NOT NULL,
    `isi` TEXT NOT NULL,
    `tanggal` DATETIME(3) NOT NULL,
    `lokasi` VARCHAR(191) NOT NULL,
    `kategori` VARCHAR(191) NOT NULL,
    `foto` VARCHAR(191) NULL,
    `status` ENUM('MENUNGGU', 'DIPROSES', 'SELESAI') NOT NULL DEFAULT 'MENUNGGU',
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Laporan` ADD CONSTRAINT `Laporan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
