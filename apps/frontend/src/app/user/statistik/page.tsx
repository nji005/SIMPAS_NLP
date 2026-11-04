"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  MessageSquare, CheckCircle2, Clock, 
  ArrowRight, TrendingUp, TrendingDown 
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function PublicStatistik() {
  const [stats, setStats] = useState({
    total: 0,
    aktif: 0,
    selesai: 0,
    kategoriStats: [] as any[],
    hotspots: [] as any[],
    avgResolution: null as number | null,
    avgConfidence: null as number | null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/analytics`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Gagal memuat statistik publik:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-black py-20 md:py-24 px-4 sm:px-6 md:px-12 animate-fade-in">
      <div className="max-w-6xl mx-auto animate-fade-up">
        
        {/* HEADER */}
        <header className="text-center mb-10 md:mb-16">
          <span className="text-xs font-bold bg-black text-white px-4 py-1.5 rounded-full uppercase tracking-wider">
            Transparansi Realtime
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-gray-900 tracking-tight mt-4 mb-3 md:mb-4">
            Statistik Pengaduan Masyarakat
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Pantau ringkasan data, kategori aduan terbanyak, dan daerah teraktif secara terbuka untuk mewujudkan layanan publik yang lebih transparan.
          </p>
        </header>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 md:mb-12">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">Total Laporan</span>
                <span className="p-2 bg-gray-50 text-black rounded-lg"><MessageSquare size={16} /></span>
              </div>
              {isLoading ? (
                <div className="h-10 w-24 bg-gray-200/60 rounded animate-shimmer"></div>
              ) : (
                <p className="text-4xl font-extrabold tracking-tight text-black">{stats.total}</p>
              )}
            </div>
            <p className="text-xs font-bold text-gray-400 mt-4 flex items-center gap-1">
              <TrendingUp size={14} className="text-green-500" /> Pengaduan dari masyarakat
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">Sedang Diproses</span>
                <span className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Clock size={16} /></span>
              </div>
              {isLoading ? (
                <div className="h-10 w-24 bg-gray-200/60 rounded animate-shimmer"></div>
              ) : (
                <p className="text-4xl font-extrabold tracking-tight text-orange-600">{stats.aktif}</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4 font-medium">Dalam verifikasi & penanganan dinas</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">Tuntas Diselesaikan</span>
                <span className="p-2 bg-green-50 text-green-600 rounded-lg"><CheckCircle2 size={16} /></span>
              </div>
              {isLoading ? (
                <div className="h-10 w-24 bg-gray-200/60 rounded animate-shimmer"></div>
              ) : (
                <p className="text-4xl font-extrabold tracking-tight text-green-600">{stats.selesai}</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4 font-medium">Laporan berhasil ditangani petugas</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">Durasi Resolusi</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><TrendingDown size={16} /></span>
              </div>
              {isLoading ? (
                <div className="h-10 w-24 bg-gray-200/60 rounded animate-shimmer"></div>
              ) : stats.avgResolution !== null ? (
                <p className="text-4xl font-extrabold tracking-tight text-black">{stats.avgResolution}<span className="text-lg font-medium text-gray-400 ml-1">jam</span></p>
              ) : (
                <p className="text-4xl font-extrabold tracking-tight text-black">—</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4 font-medium">
              {stats.avgResolution !== null ? "Rata-rata waktu penyelesaian aduan" : "Belum ada data"}
            </p>
          </div>
        </div>

        {/* BOTTOM METRICS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Left: Category Distribution */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex justify-between items-center">
              Distribusi Keluhan Terbanyak
              <span className="text-[10px] font-bold bg-gray-100 px-2.5 py-1 rounded-full text-gray-500 uppercase tracking-wider">Kategori</span>
            </h2>
            
            <div className="flex flex-col gap-6">
              {isLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col gap-2 animate-shimmer">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <div className="h-4 w-32 bg-gray-200/60 rounded"></div>
                      <div className="h-4 w-10 bg-gray-200/60 rounded"></div>
                    </div>
                    <div className="w-full h-3 bg-gray-200/60 rounded-full"></div>
                  </div>
                ))
              ) : (
                stats.kategoriStats.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span className="text-gray-700">{item.name}</span>
                      <span className="text-black">{item.pct}</span>
                    </div>
                    <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          idx === 0 ? "bg-black" : 
                          idx === 1 ? "bg-gray-700" :
                          idx === 2 ? "bg-gray-500" : "bg-gray-300"
                        }`} 
                        style={{ width: item.pct }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Geographical hotspots */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex justify-between items-center">
              Wilayah Pengaduan Teraktif
              <span className="text-[10px] font-bold bg-gray-100 px-2.5 py-1 rounded-full text-gray-500 uppercase tracking-wider">Hotspots</span>
            </h2>
            
            <div className="flex flex-col gap-4">
              {isLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0 animate-shimmer">
                    <div className="flex items-center gap-4">
                      <span className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center"></span>
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
                        <div className="h-3.5 w-16 bg-gray-200/60 rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-12 bg-gray-200/60 rounded"></div>
                  </div>
                ))
              ) : (
                stats.hotspots.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-7 h-7 bg-gray-50 border border-gray-100 text-gray-600 font-extrabold text-[11px] rounded-lg flex items-center justify-center">
                        {item.rank}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-gray-800">{item.name}</span>
                        <span className="text-[11px] font-medium text-gray-400">{item.city}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[14px] font-bold text-black flex items-center gap-1">
                        {item.count} <span className="text-[11px] font-medium text-gray-400">Laporan</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CTA TO REPORT */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 text-center max-w-2xl mx-auto">
          <h2 className="text-xl font-extrabold mb-2">Punya Keluhan Mengenai Fasilitas Umum?</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
            Bantu kami memetakan masalah kota dengan mengirimkan laporan aduan yang akurat, cepat, dan terarah.
          </p>
          <Link 
            href="/#form-lapor" 
            className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors shadow-md"
          >
            Buat Laporan Warga <ArrowRight size={16} />
          </Link>
        </div>

      </div>
    </main>
  );
}
