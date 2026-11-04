"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertCircle, FileText, ImageIcon, MapPin } from "lucide-react";
import { API_BASE_URL, getCurrentUser } from "@/lib/api-client";
import { parseComplaintBody, getStatusBadge, formatTanggal } from "@/lib/laporan-format";

export default function RiwayatPage() {
  const [user, setUser] = useState<any>(null);
  const [riwayat, setRiwayat] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Cek User Login
  useEffect(() => {
    async function checkAndFetch() {
      const serverUser = await getCurrentUser();
      if (serverUser) {
        setUser(serverUser);
        fetchRiwayat();
      } else {
        setIsLoading(false);
      }
    }
    checkAndFetch();
  }, []);

  // 2. Fungsi Tarik Data dari API
  const fetchRiwayat = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/riwayat`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setRiwayat(data);
      }
    } catch (error) {
      console.error("Gagal mengambil riwayat:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- TAMPILAN JIKA BELUM LOGIN ---
  if (!user && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Akses Ditolak</h1>
        <p className="text-gray-500 mb-6 text-center">Anda harus masuk terlebih dahulu untuk melihat riwayat laporan Anda.</p>
        <Link href="/login" className="bg-black text-white px-6 py-3 rounded-md text-sm font-bold shadow-md hover:bg-gray-800 transition-colors">
          Masuk ke Akun Saya
        </Link>
      </main>
    );
  }

  // --- TAMPILAN UTAMA RIWAYAT (DAFTAR RINGKAS) ---
  return (
    <main className="min-h-screen bg-gray-50 text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 md:mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Riwayat Laporan</h1>
          <p className="text-gray-500 mt-2 text-sm">Pantau status pengaduan yang telah Anda kirimkan.</p>
        </header>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 flex flex-col gap-3 animate-shimmer"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-24 bg-gray-200/60 rounded-full"></div>
                    <div className="h-5 w-24 bg-gray-200/60 rounded-full"></div>
                  </div>
                  <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
                </div>
                <div className="h-6 w-3/4 bg-gray-200/60 rounded"></div>
                <div className="h-4 w-full bg-gray-100/80 rounded"></div>
                <div className="h-4 w-4/5 bg-gray-100/80 rounded"></div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="h-4 w-32 bg-gray-200/60 rounded"></div>
                  <div className="h-4 w-20 bg-gray-200/60 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : riwayat.length === 0 ? (
          <div className="bg-white p-6 sm:p-12 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Belum ada laporan</h2>
            <p className="text-gray-500 text-sm mb-6">Anda belum pernah membuat laporan pengaduan apapun.</p>
            <Link href="/#form-lapor" className="bg-black text-white px-6 py-3 rounded-md text-sm font-bold shadow-md hover:bg-gray-800 transition-colors min-h-[44px] flex items-center">
              Buat Laporan Baru
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {riwayat.map((item) => {
              const parsed = parseComplaintBody(item.isi);
              const hasAttachment = Boolean(item.foto);
              const hasResponse = Boolean(item.catatanSelesai || item.fotoSelesai);

              return (
                <Link
                  key={item.id}
                  href={`/user/riwayat/${item.id}`}
                  className="group bg-white rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-black"
                  tabIndex={0}
                >
                  {/* Baris 1: Status badge, Kategori, Tanggal Kirim */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.status)}
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full uppercase">
                        {parsed.category}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-400">
                      {formatTanggal(item.createdAt)}
                    </span>
                  </div>

                  {/* Baris 2: Judul Laporan */}
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 group-hover:text-black transition-colors leading-snug">
                    {item.judul}
                  </h3>

                  {/* Baris 3: Lokasi (bila ada) */}
                  {parsed.location && (
                    <p className="text-xs text-gray-500 font-bold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> Lokasi: <span className="text-gray-700 font-semibold">{parsed.location}</span>
                    </p>
                  )}

                  {/* Baris 4: Cuplikan isi maks 2 baris (line-clamp-2) */}
                  <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                    {parsed.details}
                  </p>

                  {/* Baris 5: Footer kartu - Penanda kecil & Tautan Lihat Detail */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs mt-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      {hasAttachment && (
                        <span className="inline-flex items-center gap-1 text-gray-500 font-medium bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200/60">
                          <ImageIcon className="w-3.5 h-3.5 text-gray-400" /> Ada lampiran
                        </span>
                      )}
                      {hasResponse && (
                        <span className="inline-flex items-center gap-1 text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-md border border-green-200/60">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Ada tanggapan
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-bold text-black group-hover:translate-x-0.5 transition-transform ml-auto">
                      Lihat detail <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
