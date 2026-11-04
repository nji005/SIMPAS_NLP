"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
  MapPin,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { API_BASE_URL, getCurrentUser } from "@/lib/api-client";
import { parseComplaintBody, getStatusBadge, formatTanggal } from "@/lib/laporan-format";

export default function RiwayatDetailPage({ params }: { params?: { id?: string } }) {
  const routeParams = useParams();
  const id = params?.id || (routeParams?.id as string);

  const [user, setUser] = useState<any>(null);
  const [laporan, setLaporan] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<"404" | "network" | null>(null);

  // 1. Cek Sesi Pengguna
  useEffect(() => {
    async function checkAuth() {
      const serverUser = await getCurrentUser();
      if (serverUser) {
        setUser(serverUser);
      } else {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  // 2. Tarik Data Detail Laporan
  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/riwayat/${id}`, {
        credentials: "include",
      });

      if (response.status === 404 || response.status === 400) {
        setErrorStatus("404");
        setLaporan(null);
      } else if (!response.ok) {
        setErrorStatus("network");
        setLaporan(null);
      } else {
        const data = await response.json();
        setLaporan(data);
        setErrorStatus(null);
      }
    } catch (err) {
      console.error("Gagal mengambil detail riwayat:", err);
      setErrorStatus("network");
      setLaporan(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) {
      fetchDetail();
    }
  }, [user, id, fetchDetail]);

  // --- KEADAAN: BELUM LOGIN ---
  if (!user && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-black animate-fade-in">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Akses Ditolak</h1>
        <p className="text-gray-500 mb-6 text-center max-w-md">
          Anda harus masuk terlebih dahulu untuk melihat detail laporan pengaduan Anda.
        </p>
        <Link
          href="/login"
          className="bg-black text-white px-6 py-3 rounded-md text-sm font-bold shadow-md hover:bg-gray-800 transition-colors"
        >
          Masuk ke Akun Saya
        </Link>
      </main>
    );
  }

  // --- KEADAAN: SKELETON LOADING ---
  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 animate-fade-in">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div className="h-5 w-36 bg-gray-200/60 rounded animate-shimmer"></div>
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col gap-5 animate-shimmer">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-24 bg-gray-200/60 rounded-full"></div>
                <div className="h-5 w-24 bg-gray-200/60 rounded-full"></div>
              </div>
              <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
            </div>
            <div className="h-8 w-3/4 bg-gray-200/60 rounded"></div>
            <div className="h-4 w-1/2 bg-gray-200/60 rounded"></div>
            <div className="h-32 bg-gray-100/50 rounded-xl border border-gray-100"></div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-28 animate-shimmer"></div>
        </div>
      </main>
    );
  }

  // --- KEADAAN: 404 LAPORAN TIDAK DITEMUKAN ---
  if (errorStatus === "404") {
    return (
      <main className="min-h-screen bg-gray-50 text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 flex flex-col items-center justify-center animate-fade-in">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-4 border border-red-100">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Laporan tidak ditemukan</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Laporan yang Anda cari tidak ditemukan atau bukan milik akun Anda.
          </p>
          <Link
            href="/user/riwayat"
            className="w-full inline-flex items-center justify-center gap-2 bg-black text-white px-6 py-3 rounded-md text-sm font-bold shadow-md hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Riwayat
          </Link>
        </div>
      </main>
    );
  }

  // --- KEADAAN: ERROR JARINGAN / SERVER ---
  if (errorStatus === "network" || !laporan) {
    return (
      <main className="min-h-screen bg-gray-50 text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 flex flex-col items-center justify-center animate-fade-in">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-4 border border-amber-100">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Terjadi Kesalahan</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Gagal memuat detail laporan karena masalah jaringan atau server.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              type="button"
              onClick={fetchDetail}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-black text-white px-5 py-3 rounded-md text-sm font-bold shadow-md hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Coba lagi
            </button>
            <Link
              href="/user/riwayat"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-5 py-3 rounded-md text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              Kembali
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Ekstrak metadata laporan dari string isi
  const parsed = parseComplaintBody(laporan.isi);
  const tanggalKejadian = parsed.date || (laporan.tanggalKejadian ? formatTanggal(laporan.tanggalKejadian) : null);

  // Penanda status untuk tahapan
  const isPending = laporan.status === "PENDING";
  const isProses = laporan.status === "PROSES";
  const isSelesai = laporan.status === "SELESAI";

  return (
    <main className="min-h-screen bg-gray-50 text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 animate-fade-in">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        {/* 1. Tautan Kembali ke Riwayat */}
        <div>
          <Link
            href="/user/riwayat"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-black transition-colors group w-fit"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Kembali ke Riwayat
          </Link>
        </div>

        {/* 2. Kartu Utama Detail Laporan */}
        <section className="bg-white rounded-2xl p-5 sm:p-7 md:p-8 shadow-sm border border-gray-100 flex flex-col gap-5">
          {/* Header Kartu: Status, Kategori, Tanggal Kirim */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              {getStatusBadge(laporan.status)}
              <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {parsed.category}
              </span>
            </div>
            <span className="text-xs font-medium text-gray-400">
              Dikirim: {formatTanggal(laporan.createdAt)}
            </span>
          </div>

          {/* Judul Laporan */}
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
            {laporan.judul}
          </h1>

          {/* Metadata Tambahan: Lokasi & Tanggal Kejadian */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-gray-500 font-medium">
            {parsed.location && (
              <p className="flex items-center gap-1.5 font-bold">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                Lokasi: <span className="text-gray-800 font-semibold">{parsed.location}</span>
              </p>
            )}

            {tanggalKejadian && (
              <p className="flex items-center gap-1.5 font-bold">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                Tanggal Kejadian: <span className="text-gray-800 font-semibold">{tanggalKejadian}</span>
              </p>
            )}
          </div>

          {/* Isi Laporan Lengkap */}
          <div className="flex flex-col gap-2 pt-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Uraian Pengaduan
            </span>
            <div className="text-sm sm:text-base text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50/70 p-4 sm:p-5 rounded-xl border border-gray-100 font-normal">
              {parsed.details || laporan.isi}
            </div>
          </div>
        </section>

        {/* 3. Penanda Tahapan Status */}
        <section className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
            Tahapan Penanganan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-2 relative">
            {/* Tahap 1: Diterima */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-green-100 text-green-700 border border-green-300 flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-900">Diterima</span>
                <span className="text-xs text-gray-500 mt-0.5">
                  {formatTanggal(laporan.createdAt)}
                </span>
              </div>
            </div>

            {/* Tahap 2: Diproses */}
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  isProses || isSelesai
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-gray-100 text-gray-400 border border-gray-200"
                }`}
              >
                {isProses || isSelesai ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span>2</span>
                )}
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-sm font-bold ${
                    isProses || isSelesai ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  Diproses
                </span>
                <span className="text-xs text-gray-400 mt-0.5">
                  {isPending ? "Menunggu tindak lanjut" : "Sedang ditindaklanjuti"}
                </span>
              </div>
            </div>

            {/* Tahap 3: Selesai */}
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  isSelesai
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-gray-100 text-gray-400 border border-gray-200"
                }`}
              >
                {isSelesai ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span>3</span>
                )}
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-sm font-bold ${
                    isSelesai ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  Selesai
                </span>
                <span className="text-xs text-gray-500 mt-0.5">
                  {isSelesai && laporan.selesaiAt
                    ? formatTanggal(laporan.selesaiAt)
                    : isSelesai
                    ? "Telah diselesaikan"
                    : "Belum selesai"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Foto Lampiran Pelapor */}
        {/* Catatan: Bila laporan berstatus SELESAI dan foto bukti tersedia, foto Sebelum/Sesudah
            akan ditampilkan di blok tanggapan di bawah, sehingga foto di sini tidak diduplikasi */}
        {laporan.foto && !(isSelesai && laporan.fotoSelesai) && (
          <section className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100 flex flex-col gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-gray-400" /> Foto Lampiran Pelapor
            </span>
            <div
              className="w-full sm:max-w-md h-56 sm:h-72 relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group"
              onClick={() => window.open(laporan.foto, "_blank")}
            >
              <img
                src={laporan.foto}
                alt="Foto Lampiran"
                className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
              />
            </div>
            <span className="text-xs text-gray-400">Klik gambar untuk memperbesar</span>
          </section>
        )}

        {/* 5. Blok Tanggapan Penyelesaian (Hanya jika status SELESAI) */}
        {isSelesai && (
          <section className="bg-green-50/50 border border-green-200/80 rounded-2xl p-5 sm:p-7 md:p-8 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-green-200/60 pb-3">
              <div className="flex items-center gap-2 text-green-800 font-bold text-sm sm:text-base">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>Tanggapan Penyelesaian</span>
              </div>
              {laporan.selesaiAt && (
                <span className="text-xs text-green-800 font-medium">
                  Diselesaikan: {formatTanggal(laporan.selesaiAt)}
                </span>
              )}
            </div>

            <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line bg-white/90 border border-green-100 p-4 rounded-xl shadow-sm font-medium">
              {laporan.catatanSelesai || (
                <span className="italic text-gray-400">Belum ada tanggapan tercatat.</span>
              )}
            </div>

            {/* Foto Sebelum & Sesudah jika ada keduanya */}
            {laporan.foto && laporan.fotoSelesai ? (
              <div className="mt-2">
                <span className="text-[11px] font-bold text-green-900 uppercase tracking-wider block mb-2">
                  Dokumentasi Sebelum & Sesudah
                </span>
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Foto Sebelum */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-600 bg-gray-200/80 px-2.5 py-0.5 rounded-md w-fit">
                      Sebelum
                    </span>
                    <div
                      className="w-full h-48 sm:h-56 relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group"
                      onClick={() => window.open(laporan.foto, "_blank")}
                    >
                      <img
                        src={laporan.foto}
                        alt="Foto Sebelum"
                        className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 text-center">Klik untuk perbesar</span>
                  </div>

                  {/* Foto Sesudah */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-green-800 bg-green-200/80 px-2.5 py-0.5 rounded-md w-fit">
                      Sesudah
                    </span>
                    <div
                      className="w-full h-48 sm:h-56 relative rounded-xl overflow-hidden border border-green-200 bg-white cursor-pointer group"
                      onClick={() => window.open(laporan.fotoSelesai, "_blank")}
                    >
                      <img
                        src={laporan.fotoSelesai}
                        alt="Foto Sesudah"
                        className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                      />
                    </div>
                    <span className="text-[10px] text-green-800 text-center font-medium">Klik untuk perbesar</span>
                  </div>
                </div>
              </div>
            ) : laporan.fotoSelesai ? (
              <div className="mt-2">
                <span className="text-[11px] font-bold text-green-900 uppercase tracking-wider block mb-2">
                  Foto Bukti Penyelesaian
                </span>
                <div
                  className="w-full sm:max-w-xs h-48 sm:h-56 relative rounded-xl overflow-hidden border border-green-200 bg-white cursor-pointer group"
                  onClick={() => window.open(laporan.fotoSelesai, "_blank")}
                >
                  <img
                    src={laporan.fotoSelesai}
                    alt="Foto Bukti Penyelesaian"
                    className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                  />
                </div>
                <span className="text-[10px] text-green-800 mt-1 block font-medium">Klik untuk perbesar</span>
              </div>
            ) : null}
          </section>
        )}

      </div>
    </main>
  );
}

