import React from "react";
import { Clock, AlertCircle, CheckCircle2 } from "lucide-react";

// Fungsi pembantu mengekstrak metadata dari string isi aduan
export const parseComplaintBody = (isiText: string) => {
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

  let categoryDisplay = categoryMatch ? categoryMatch[1] : "Lainnya";
  if (categoryDisplay.toLowerCase() === "infrastruktur") categoryDisplay = "Infrastruktur & Fasilitas Umum";
  else if (categoryDisplay.toLowerCase() === "lingkungan") categoryDisplay = "Lingkungan & Kebersihan";
  else if (categoryDisplay.toLowerCase() === "pelayanan") categoryDisplay = "Pelayanan Publik";
  else categoryDisplay = "Lainnya";

  return {
    category: categoryDisplay,
    date: dateMatch ? dateMatch[1] : "",
    location: locationMatch ? locationMatch[1] : "",
    details: cleanedIsi
  };
};

// Fungsi Pembantu: Ubah status menjadi warna badge yang cantik
export const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDING":
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full text-xs font-bold uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" /> Menunggu
        </span>
      );
    case "PROSES":
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold uppercase tracking-wider">
          <AlertCircle className="w-3.5 h-3.5" /> Diproses
        </span>
      );
    case "SELESAI":
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-bold uppercase tracking-wider">
          <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
        </span>
      );
    default:
      return null;
  }
};

// Fungsi Pembantu: Format tanggal jadi lebih enak dibaca
export const formatTanggal = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  };
  return new Date(dateString).toLocaleDateString('id-ID', options);
};
