"use client";

import { useState, useEffect } from "react";
import { Download, Printer, Filter } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function AdminReports() {
  const [laporan, setLaporan] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("SEMUA");
  const [selectedStatus, setSelectedStatus] = useState("SEMUA");

  useEffect(() => {
    fetchLaporan();
  }, []);

  const fetchLaporan = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/laporan`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLaporan(data);
      }
    } catch (error) {
      console.error("Gagal mengambil data laporan:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const parseComplaintBody = (isiText: string) => {
    if (!isiText) return { category: "Lainnya", date: "", location: "", details: "" };
    
    const categoryMatch = isiText.match(/\[KATEGORI:\s*(.*?)\]/);
    const dateMatch = isiText.match(/\[TANGGAL:\s*(.*?)\]/);
    const locationMatch = isiText.match(/\[LOKASI:\s*(.*?)\]/);
    
    let cleanedIsi = isiText;
    cleanedIsi = cleanedIsi.replace(/\[KATEGORI:.*?\]\n?/gi, "");
    cleanedIsi = cleanedIsi.replace(/\[TANGGAL:.*?\]\n?/gi, "");
    cleanedIsi = cleanedIsi.replace(/\[LOKASI:.*?\]\n?/gi, "");
    cleanedIsi = cleanedIsi.replace(/DETAIL LAPORAN:\n?/gi, "");
    cleanedIsi = cleanedIsi.trim();

    const cat = categoryMatch ? categoryMatch[1].toLowerCase() : "lainnya";
    let categoryDisplay = "Lainnya";
    if (cat.includes("infrastruktur")) categoryDisplay = "Infrastruktur";
    else if (cat.includes("lingkungan")) categoryDisplay = "Lingkungan";
    else if (cat.includes("pelayanan")) categoryDisplay = "Pelayanan";

    return {
      category: categoryDisplay,
      date: dateMatch ? dateMatch[1] : "",
      location: locationMatch ? locationMatch[1] : "",
      details: cleanedIsi
    };
  };

  // Filtering Logic
  const filteredLaporan = laporan.filter((item) => {
    const parsed = parseComplaintBody(item.isi);
    
    // 1. Status Filter
    if (selectedStatus !== "SEMUA" && item.status !== selectedStatus) {
      return false;
    }

    // 2. Category Filter
    if (selectedCategory !== "SEMUA" && parsed.category.toUpperCase() !== selectedCategory.toUpperCase()) {
      return false;
    }

    // 3. Date Range Filter
    const reportDate = new Date(item.createdAt);
    reportDate.setHours(0, 0, 0, 0); // normalize time

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (reportDate < start) return false;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (reportDate > end) return false;
    }

    return true;
  });

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLaporan.length === 0) {
      alert("Tidak ada data laporan untuk diexport!");
      return;
    }

    const headers = [
      "ID Laporan",
      "Nama Pelapor",
      "NIK",
      "Email",
      "Judul Laporan",
      "Kategori",
      "Tanggal Kejadian",
      "Lokasi Kejadian",
      "Status",
      "Tanggal Lapor",
      "Isi Laporan"
    ];

    const rows = filteredLaporan.map((item) => {
      const parsed = parseComplaintBody(item.isi);
      const rowData = [
        item.id,
        item.user?.nama || "Warga Anonim",
        item.user?.nik || "",
        item.user?.email || "",
        item.judul,
        parsed.category,
        parsed.date || "",
        parsed.location || "",
        item.status,
        new Date(item.createdAt).toLocaleDateString("id-ID"),
        parsed.details.replace(/\n/g, " ").replace(/"/g, '""') // Escape quotes and newlines
      ];
      return rowData.map(val => `"${val}"`).join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const filename = `Laporan_Pengaduan_SIPMAS_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report Layout
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl w-full animate-fade-up print:bg-white print:p-0">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-black mb-2">Laporan Rekapitulasi</h1>
          <p className="text-gray-500 font-medium text-sm sm:text-base">Ekspor data pengaduan masyarakat untuk keperluan rekap dokumen.</p>
        </div>
        
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <button 
            onClick={handlePrint}
            className="bg-white border border-gray-200 text-black px-4 py-2.5 rounded-xl text-[12px] font-bold flex items-center gap-2 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Printer size={15} /> Cetak Laporan
          </button>
          <button 
            onClick={handleExportCSV}
            className="bg-black text-white px-4 py-2.5 rounded-xl text-[12px] font-bold flex items-center gap-2 hover:bg-gray-800 shadow-sm transition-colors"
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm mb-6 print:hidden">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Filter size={14} /> Panel Filter Laporan
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Start Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Tanggal Awal</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Tanggal Akhir</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Kategori</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black"
            >
              <option value="SEMUA">Semua Kategori</option>
              <option value="INFRASTRUKTUR">Infrastruktur</option>
              <option value="LINGKUNGAN">Lingkungan</option>
              <option value="PELAYANAN">Pelayanan</option>
              <option value="LAINNYA">Lainnya</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Status</label>
            <select 
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="PENDING">PENDING</option>
              <option value="PROSES">PROSES</option>
              <option value="SELESAI">SELESAI</option>
            </select>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block mb-8 text-center border-b-2 border-black pb-4">
        <h1 className="text-3xl font-extrabold tracking-wider text-black">LAPORAN REKAPITULASI PENGADUAN</h1>
        <p className="text-sm font-semibold text-gray-600 mt-1">SIPMAS - KONSOL PENGADUAN MASYARAKAT</p>
        <div className="text-xs text-gray-500 mt-3 flex justify-center gap-6">
          {startDate && <span>Dari Tanggal: <b>{new Date(startDate).toLocaleDateString("id-ID")}</b></span>}
          {endDate && <span>Sampai Tanggal: <b>{new Date(endDate).toLocaleDateString("id-ID")}</b></span>}
          <span>Kategori: <b>{selectedCategory}</b></span>
          <span>Status: <b>{selectedStatus}</b></span>
        </div>
      </div>

      {/* RESULTS TABLE */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse animate-shimmer">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4 w-12 text-center">ID</th>
                  <th className="px-6 py-4">Reporter</th>
                  <th className="px-6 py-4">Judul Keluhan</th>
                  <th className="px-6 py-4">Kategori</th>
                  <th className="px-6 py-4">Lokasi</th>
                  <th className="px-6 py-4">Tanggal Masuk</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 text-center font-bold text-gray-300">#--</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-28 bg-gray-200/60 rounded"></div>
                        <div className="h-3.5 w-20 bg-gray-200/60 rounded"></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-36 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 w-20 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-24 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-block h-5 w-16 bg-gray-200/60 rounded-full"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredLaporan.length === 0 ? (
        <div className="bg-white p-16 text-center rounded-xl border border-gray-100 shadow-sm text-gray-400 text-sm font-semibold">
          Tidak ada data laporan yang sesuai dengan filter saat ini.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:border-0 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse print:text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider print:bg-gray-100 print:text-black">
                  <th className="px-6 py-4 w-12 text-center">ID</th>
                  <th className="px-6 py-4">Reporter</th>
                  <th className="px-6 py-4">Judul Keluhan</th>
                  <th className="px-6 py-4">Kategori</th>
                  <th className="px-6 py-4">Lokasi</th>
                  <th className="px-6 py-4">Tanggal Masuk</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px] print:divide-gray-200 print:text-black">
                {filteredLaporan.map((item) => {
                  const parsed = parseComplaintBody(item.isi);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors print:hover:bg-transparent">
                      <td className="px-6 py-4 font-bold text-center text-gray-500 print:text-black">#{item.id}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-black">{item.user?.nama || "Warga Anonim"}</span>
                          <span className="text-[11px] text-gray-400 font-medium print:text-gray-600">NIK: {item.user?.nik}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-black">{item.judul}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-gray-100 text-gray-600 border border-gray-200 print:bg-transparent print:border-0 print:p-0">
                          {parsed.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium print:text-black">{parsed.location || "-"}</td>
                      <td className="px-6 py-4 text-gray-500 font-medium print:text-black">
                        {new Date(item.createdAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase print:border print:border-black print:px-2 print:py-0.5 ${
                          item.status === 'SELESAI' ? 'bg-green-50 text-green-700 print:bg-transparent' :
                          item.status === 'PROSES' ? 'bg-orange-50 text-orange-700 print:bg-transparent' :
                          'bg-red-50 text-red-700 print:bg-transparent'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* PRINT-ONLY FOOTER */}
          <div className="hidden print:flex justify-between items-center mt-12 px-6 text-[11px] text-gray-500">
            <span>Dicetak secara otomatis oleh sistem Konsol Admin SIPMAS pada: {new Date().toLocaleString("id-ID")}</span>
            <div className="text-center w-48">
              <p className="mb-12 font-bold text-black">Petugas Administrasi</p>
              <div className="border-b border-black w-full"></div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
