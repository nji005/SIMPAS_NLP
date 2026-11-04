-- Sederhanakan kategori menjadi 3 kategori resmi (Infrastruktur, Lingkungan, Pelayanan) + Lainnya
-- Ubah kategori keamanan/ketertiban menjadi 'Lainnya'. Kolom kategoriPrediksi TIDAK disentuh.
UPDATE Laporan SET kategori = 'Lainnya' WHERE LOWER(kategori) LIKE '%keamanan%' OR LOWER(kategori) LIKE '%ketertiban%';
