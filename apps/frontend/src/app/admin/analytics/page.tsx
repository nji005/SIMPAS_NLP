"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp, TrendingDown, CheckCircle2, Clock, Loader2
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function AdminAnalytics() {
  const [timeRange, setTimeRange] = useState("SEMUA");
  const [categoryFilter, setCategoryFilter] = useState("SEMUA");
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
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/analytics?range=${timeRange}&category=${categoryFilter}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Gagal memuat analitik:", error);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    };

    fetchAnalytics();
  }, [timeRange, categoryFilter]);

  return (
    <div className="max-w-6xl w-full animate-in fade-in duration-200">

      {/* HEADER SECTION */}
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-black">Statistik & Analitik</h1>
      </div>

      {/* FILTER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex gap-3">
          {/* Filter Waktu */}
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-white border border-gray-200 pl-4 pr-10 py-2.5 rounded-full text-[13px] font-bold text-black shadow-sm cursor-pointer hover:bg-gray-50 outline-none appearance-none transition-all"
            >
              <option value="SEMUA">Semua Waktu</option>
              <option value="HARI_INI">Hari Ini</option>
              <option value="MINGGU_INI">Minggu Ini</option>
              <option value="BULAN_INI">Bulan Ini</option>
            </select>
            <span className="absolute right-4 top-3.5 text-[10px] text-gray-400 pointer-events-none">▼</span>
          </div>

          {/* Filter Kategori */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-gray-200 pl-4 pr-10 py-2.5 rounded-full text-[13px] font-bold text-black shadow-sm cursor-pointer hover:bg-gray-50 outline-none appearance-none transition-all"
            >
              <option value="SEMUA">Semua Kategori</option>
              <option value="INFRASTRUKTUR">Infrastruktur</option>
              <option value="LINGKUNGAN">Lingkungan</option>
              <option value="PELAYANAN">Pelayanan</option>
              <option value="LAINNYA">Lainnya</option>
            </select>
            <span className="absolute right-4 top-3.5 text-[10px] text-gray-400 pointer-events-none">▼</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-gray-500 font-medium">Status Koneksi:</span>
          {isLoading ? (
            <span className="bg-blue-50 text-blue-800 px-3 py-1 rounded-full font-bold flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memperbarui...
            </span>
          ) : (
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Live Database
            </span>
          )}
        </div>
      </div>

      {isInitialLoad ? (
        <>
          {/* 4 SUMMARY CARDS SKELETON */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm animate-shimmer">
                <div className="h-4 w-24 bg-gray-200/60 rounded mb-4"></div>
                <div className="h-9 w-20 bg-gray-200/60 rounded mb-4"></div>
                <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
              </div>
            ))}
          </div>

          {/* BOTTOM SECTION SKELETON */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
            {/* Left Category Skeleton */}
            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm animate-shimmer">
              <div className="h-6 w-36 bg-gray-200/60 rounded mb-6"></div>
              <div className="flex flex-col gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 w-24 bg-gray-200/60 rounded"></div>
                    <div className="flex-1 h-2 bg-gray-200/60 rounded-full"></div>
                    <div className="h-4 w-8 bg-gray-200/60 rounded"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Hotspot Skeleton */}
            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm animate-shimmer">
              <div className="h-6 w-36 bg-gray-200/60 rounded mb-6"></div>
              <div className="flex flex-col gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <div className="w-6 h-6 bg-gray-200/60 rounded"></div>
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
                        <div className="h-3.5 w-16 bg-gray-200/60 rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 w-12 bg-gray-200/60 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={`transition-opacity duration-300 ${isLoading ? "opacity-60 pointer-events-none" : ""}`}>
          {/* 4 SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-[13px] font-bold text-gray-500 mb-2">Total Laporan</h3>
              <p className="text-4xl font-extrabold text-black tracking-tight mb-4">{stats.total.toLocaleString()}</p>
              <div className="flex items-center gap-2 text-[12px] font-bold text-gray-500">
                <TrendingUp size={14} className="text-gray-600" strokeWidth={3} /> Terus bertambah
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-[13px] font-bold text-gray-500 mb-2">Laporan Pembaharuan</h3>
              <p className="text-4xl font-extrabold text-black tracking-tight mb-4">{stats.aktif}</p>
              <div className="flex items-center gap-2 text-[12px] font-bold text-gray-500">
                <Clock size={14} className="text-orange-500" strokeWidth={3} /> Menunggu tindak lanjut
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-[13px] font-bold text-gray-500 mb-2">Laporan Selesai</h3>
              <p className="text-4xl font-extrabold text-black tracking-tight mb-4">{stats.selesai}</p>
              <div className="flex items-center gap-2 text-[12px] font-bold text-gray-500">
                <CheckCircle2 size={14} className="text-green-600" strokeWidth={3} /> Telah diselesaikan
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-[13px] font-bold text-gray-500 mb-2">Rata-rata Resolusi</h3>
              {stats.avgResolution !== null ? (
                <p className="text-4xl font-extrabold text-black tracking-tight mb-4">{stats.avgResolution}<span className="text-xl font-medium text-gray-400 ml-1">jam</span></p>
              ) : (
                <p className="text-4xl font-extrabold text-black tracking-tight mb-4">—</p>
              )}
              <div className="flex items-center gap-2 text-[12px] font-bold text-gray-500">
                {stats.avgResolution !== null ? (
                  <>
                    <TrendingDown size={14} className="text-green-600" strokeWidth={3} /> Sangat Cepat
                  </>
                ) : (
                  "Belum ada data"
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
            {/* Left: SVM Categories */}
            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
              <h2 className="text-lg font-extrabold text-black mb-6 flex items-center justify-between">
                Distribusi Kategori
                <span className="text-[10px] font-bold bg-gray-100 px-2 py-1 rounded text-gray-500">REALTIME</span>
              </h2>
              <div className="flex flex-col gap-5">
                {stats.kategoriStats.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 text-[13px] font-bold text-gray-600">
                    <span className="w-24 truncate">{item.name}</span>
                    <div className="flex-1 h-2 bg-[#f4f5f7] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${item.light ? 'bg-gray-300' : 'bg-black'}`}
                        style={{ width: item.pct }}
                      ></div>
                    </div>
                    <span className="w-8 text-right text-black">{item.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Geographic Hotspots */}
            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
              <h2 className="text-lg font-extrabold text-black mb-6">Geographic Hotspots</h2>
              <div className="flex flex-col gap-3">
                {stats.hotspots.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <span className="w-6 h-6 bg-[#f4f5f7] text-gray-500 font-extrabold text-[11px] rounded-md flex items-center justify-center">
                        {item.rank}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-extrabold text-black">{item.name}</span>
                        <span className="text-[11px] font-medium text-gray-500">{item.city}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[13px] font-extrabold text-black">{item.count.toLocaleString()}</span>
                      <span className="text-[10px] font-medium text-gray-500">Laporan</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
