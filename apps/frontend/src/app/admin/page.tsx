"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  MessageSquare, Users, FileText, CheckCircle2, 
  Clock, AlertCircle, ArrowRight 
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    aktif: 0,
    selesai: 0
  });
  const [recentComplaints, setRecentComplaints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, complaintsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/analytics`, { credentials: "include" }),
          fetch(`${API_BASE_URL}/api/admin/laporan`, { credentials: "include" })
        ]);

        if (statsRes.ok && complaintsRes.ok) {
          const statsData = await statsRes.json();
          const complaintsData = await complaintsRes.json();
          setStats(statsData);
          setRecentComplaints(complaintsData.slice(0, 5)); // Get latest 5
        }
      } catch (error) {
        console.error("Gagal memuat data dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="max-w-6xl w-full animate-fade-up">
      
      {/* WELCOME BANNER */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-black mb-2">Dashboard Utama</h1>
        <p className="text-gray-500 font-medium text-sm sm:text-base">Ringkasan operasional dan laporan masyarakat terbaru.</p>
      </div>

      {/* QUICK STATUS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <div className="bg-white p-5 sm:p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[13px] font-bold text-gray-500 uppercase">Total Laporan</span>
            <span className="p-2 bg-gray-100 text-black rounded-lg"><MessageSquare size={16} /></span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200/60 rounded animate-shimmer"></div>
          ) : (
            <p className="text-3xl font-extrabold text-black tracking-tight">{stats.total}</p>
          )}
          <Link href="/admin/complaints" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-1 mt-4 transition-colors">
            Lihat semua laporan <ArrowRight size={12} />
          </Link>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[13px] font-bold text-gray-500 uppercase">Laporan Pending</span>
            <span className="p-2 bg-red-50 text-red-600 rounded-lg"><AlertCircle size={16} /></span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200/60 rounded animate-shimmer"></div>
          ) : (
            <p className="text-3xl font-extrabold text-red-600 tracking-tight">
              {recentComplaints.filter(c => c.status === "PENDING").length || Math.max(0, stats.aktif - recentComplaints.filter(c => c.status === "PROSES").length)}
            </p>
          )}
          <span className="text-xs text-gray-400 font-medium block mt-4">Membutuhkan respon segera</span>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[13px] font-bold text-gray-500 uppercase">Sedang Diproses</span>
            <span className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Clock size={16} /></span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200/60 rounded animate-shimmer"></div>
          ) : (
            <p className="text-3xl font-extrabold text-orange-600 tracking-tight">
              {recentComplaints.filter(c => c.status === "PROSES").length || Math.min(stats.aktif, 2)}
            </p>
          )}
          <span className="text-xs text-gray-400 font-medium block mt-4">Dalam tindak lanjut petugas</span>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[13px] font-bold text-gray-500 uppercase">Laporan Selesai</span>
            <span className="p-2 bg-green-50 text-green-600 rounded-lg"><CheckCircle2 size={16} /></span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200/60 rounded animate-shimmer"></div>
          ) : (
            <p className="text-3xl font-extrabold text-green-600 tracking-tight">{stats.selesai}</p>
          )}
          <span className="text-xs text-gray-400 font-medium block mt-4">Tuntas diselesaikan</span>
        </div>
      </div>

      {/* QUICK LINKS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
        <Link href="/admin/complaints" className="bg-black hover:bg-gray-900 text-white p-5 sm:p-6 rounded-xl shadow-sm transition-all flex flex-col justify-between h-36 group">
          <MessageSquare className="w-8 h-8 opacity-80 group-hover:scale-110 transition-transform" />
          <div>
            <h3 className="font-bold text-base">Kelola Pengaduan</h3>
            <p className="text-xs text-gray-300 font-medium mt-1">Verifikasi, proses, dan selesaikan pengaduan warga.</p>
          </div>
        </Link>
        <Link href="/admin/users" className="bg-white hover:bg-gray-50 border border-gray-100 text-black p-5 sm:p-6 rounded-xl shadow-sm transition-all flex flex-col justify-between h-36 group">
          <Users className="w-8 h-8 text-gray-700 group-hover:scale-110 transition-transform" />
          <div>
            <h3 className="font-bold text-base text-gray-900">Kelola Pengguna</h3>
            <p className="text-xs text-gray-500 font-medium mt-1">Atur hak akses petugas dan data warga terdaftar.</p>
          </div>
        </Link>
        <Link href="/admin/reports" className="bg-white hover:bg-gray-50 border border-gray-100 text-black p-5 sm:p-6 rounded-xl shadow-sm transition-all flex flex-col justify-between h-36 group">
          <FileText className="w-8 h-8 text-gray-700 group-hover:scale-110 transition-transform" />
          <div>
            <h3 className="font-bold text-base text-gray-900">Unduh Laporan</h3>
            <p className="text-xs text-gray-500 font-medium mt-1">Filter data pengaduan berdasarkan tanggal & cetak CSV/PDF.</p>
          </div>
        </Link>
      </div>

      {/* RECENT COMPLAINTS TABLE */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6 mb-8 md:mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h2 className="text-base sm:text-lg font-extrabold text-black">Aktivitas Pengaduan Terbaru</h2>
          <Link href="/admin/complaints" className="self-start sm:self-auto text-xs font-bold text-black border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors shadow-sm">
            Lihat Semua Pengaduan
          </Link>
        </div>

        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 w-1/3">Pengadu</th>
                  <th className="pb-3 w-1/3">Judul Pengaduan</th>
                  <th className="pb-3">Tanggal Masuk</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-shimmer">
                    <td className="py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-32 bg-gray-200/60 rounded"></div>
                        <div className="h-3.5 w-24 bg-gray-200/60 rounded"></div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="h-4 w-48 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="py-4">
                      <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="py-4">
                      <div className="h-6 w-16 bg-gray-200/60 rounded-full"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : recentComplaints.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm font-medium">Belum ada pengaduan warga masuk.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 w-1/3">Pengadu</th>
                  <th className="pb-3 w-1/3">Judul Pengaduan</th>
                  <th className="pb-3">Tanggal Masuk</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px]">
                {recentComplaints.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-black">{item.user?.nama || "Warga Anonim"}</span>
                        <span className="text-[11px] text-gray-400 font-medium">NIK: {item.user?.nik}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="font-bold text-black truncate block max-w-xs">{item.judul}</span>
                    </td>
                    <td className="py-4 text-gray-500 font-medium">
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                      })}
                    </td>
                    <td className="py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        item.status === 'SELESAI' ? 'bg-green-50 text-green-700' :
                        item.status === 'PROSES' ? 'bg-orange-50 text-orange-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}