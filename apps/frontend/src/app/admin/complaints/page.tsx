"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Search, CheckCircle2, 
  Clock, AlertCircle, X, MapPin, Calendar, 
  User, Mail, FileText, Image as ImageIcon
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function AdminComplaints() {
  const [laporan, setLaporan] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("SEMUA");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("SEMUA");
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  // State untuk form penyelesaian laporan
  const [resolvingComplaint, setResolvingComplaint] = useState<any>(null);
  const [catatanSelesai, setCatatanSelesai] = useState("");
  const [fotoSelesaiFile, setFotoSelesaiFile] = useState<File | null>(null);
  const [fotoSelesaiPreview, setFotoSelesaiPreview] = useState<string | null>(null);
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  useEffect(() => {
    fetchLaporan();
    setIsMounted(true);
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
      console.error("Gagal ambil data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/laporan`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (response.ok) {
        // Refresh local list
        fetchLaporan();
        // Update selected complaint modal view if open
        if (selectedComplaint && selectedComplaint.id === id) {
          setSelectedComplaint((prev: any) => ({ ...prev, status }));
        }
      }
    } catch (error) {
      console.error("Gagal update status:", error);
    }
  };

  const openSelesaikanModal = (complaint: any) => {
    setResolvingComplaint(complaint);
    setCatatanSelesai("");
    setFotoSelesaiFile(null);
    if (fotoSelesaiPreview) {
      URL.revokeObjectURL(fotoSelesaiPreview);
    }
    setFotoSelesaiPreview(null);
    setResolutionError(null);
  };

  const closeSelesaikanModal = () => {
    setResolvingComplaint(null);
    setCatatanSelesai("");
    setFotoSelesaiFile(null);
    if (fotoSelesaiPreview) {
      URL.revokeObjectURL(fotoSelesaiPreview);
    }
    setFotoSelesaiPreview(null);
    setResolutionError(null);
  };

  const handleFotoSelesaiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setResolutionError("Format foto harus JPG, PNG, atau WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResolutionError("Ukuran foto bukti maksimal 5MB.");
      return;
    }

    setResolutionError(null);
    setFotoSelesaiFile(file);
    if (fotoSelesaiPreview) {
      URL.revokeObjectURL(fotoSelesaiPreview);
    }
    setFotoSelesaiPreview(URL.createObjectURL(file));
  };

  const removeFotoSelesai = () => {
    setFotoSelesaiFile(null);
    if (fotoSelesaiPreview) {
      URL.revokeObjectURL(fotoSelesaiPreview);
    }
    setFotoSelesaiPreview(null);
  };

  const submitSelesaikan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingComplaint) return;

    const trimmedNote = catatanSelesai.trim();
    if (trimmedNote.length < 10) {
      setResolutionError("Tanggapan penyelesaian minimal 10 karakter.");
      return;
    }
    if (trimmedNote.length > 2000) {
      setResolutionError("Tanggapan penyelesaian maksimal 2000 karakter.");
      return;
    }

    setIsSubmittingResolution(true);
    setResolutionError(null);

    try {
      const formData = new FormData();
      formData.append("catatanSelesai", trimmedNote);
      if (fotoSelesaiFile) {
        formData.append("foto", fotoSelesaiFile);
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/laporan/${resolvingComplaint.id}/selesai`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setResolutionError(data.message || "Gagal menyelesaikan laporan.");
        return;
      }

      await fetchLaporan();
      if (selectedComplaint && selectedComplaint.id === resolvingComplaint.id) {
        setSelectedComplaint(data.laporan ? { ...selectedComplaint, ...data.laporan } : {
          ...selectedComplaint,
          status: "SELESAI",
          catatanSelesai: data.laporan?.catatanSelesai || trimmedNote,
          fotoSelesai: data.laporan?.fotoSelesai || null,
          selesaiAt: data.laporan?.selesaiAt || new Date().toISOString(),
        });
      }

      closeSelesaikanModal();
    } catch (err: any) {
      console.error("Gagal menyelesaikan laporan:", err);
      setResolutionError("Terjadi kesalahan jaringan atau server.");
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Helper function to extract metadata from the body text
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

    // Mapping categories to user friendly titles
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

  // Filter & Search logic
  const filteredLaporan = laporan.filter((item) => {
    const parsed = parseComplaintBody(item.isi);
    
    // Status Filter
    const matchesStatus = filter === "SEMUA" || item.status === filter;
    
    // Category Filter
    const matchesCategory = 
      categoryFilter === "SEMUA" || 
      (categoryFilter === "INFRASTRUKTUR" && parsed.category.includes("Infrastruktur")) ||
      (categoryFilter === "LINGKUNGAN" && parsed.category.includes("Lingkungan")) ||
      (categoryFilter === "PELAYANAN" && parsed.category.includes("Pelayanan")) ||
      (categoryFilter === "LAINNYA" && parsed.category.includes("Lainnya"));
    
    // Search query matches title, details, location, reporter name, or NIK
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      item.judul.toLowerCase().includes(searchLower) ||
      parsed.details.toLowerCase().includes(searchLower) ||
      parsed.location.toLowerCase().includes(searchLower) ||
      (item.user?.nama || "").toLowerCase().includes(searchLower) ||
      (item.user?.nik || "").includes(searchLower);

    return matchesStatus && matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-6xl w-full animate-fade-up relative">
      
      {/* HEADER & FILTER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-black mb-2">Manajemen Pengaduan</h1>
          <p className="text-gray-500 font-medium text-sm sm:text-base">Validasi dan tindak lanjuti laporan warga secara real-time.</p>
        </div>
        
        {/* Status Filters */}
        <div className="flex gap-1 bg-white p-1 rounded-full border border-gray-200 shadow-sm max-w-full overflow-x-auto">
          {["SEMUA", "PENDING", "PROSES", "SELESAI"].map((s) => (
            <button 
              key={s} 
              onClick={() => setFilter(s)}
              className={`px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all whitespace-nowrap shrink-0 ${
                filter === s 
                  ? 'bg-black text-white shadow-sm' 
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* SEARCH AND CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari pengaduan berdasarkan kata kunci, nama pelapor, atau NIK..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm placeholder:text-gray-400"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-white border border-gray-200 px-4 py-3 rounded-xl text-[13px] font-bold text-gray-700 focus:outline-none focus:border-black cursor-pointer shadow-sm hover:bg-gray-50 outline-none transition-all"
        >
          <option value="SEMUA">Semua Kategori</option>
          <option value="INFRASTRUKTUR">Infrastruktur & Fasilitas Umum</option>
          <option value="LINGKUNGAN">Lingkungan & Kebersihan</option>
          <option value="PELAYANAN">Pelayanan Publik</option>
          <option value="LAINNYA">Lainnya</option>
        </select>
      </div>

      {/* COMPLAINTS LIST */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-shimmer">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 bg-gray-100/60 rounded-xl flex-shrink-0"></div>
                <div className="min-w-0 flex-1 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-48 bg-gray-200/60 rounded"></div>
                    <div className="h-4.5 w-20 bg-gray-200/60 rounded-full"></div>
                  </div>
                  <div className="h-3.5 w-64 bg-gray-200/60 rounded"></div>
                  <div className="h-3.5 w-5/6 bg-gray-200/60 rounded mt-1"></div>
                </div>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <div className="h-8.5 w-24 bg-gray-200/60 rounded-lg"></div>
                <div className="h-8.5 w-20 bg-gray-200/60 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredLaporan.length === 0 ? (
        <div className="bg-white p-16 text-center rounded-xl border border-gray-100 shadow-sm text-gray-400 text-sm font-semibold">
          Tidak ada data pengaduan warga yang cocok.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredLaporan.map((item) => {
            const parsed = parseComplaintBody(item.isi);
            return (
              <div 
                key={item.id} 
                className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 rounded-xl flex-shrink-0 ${
                    item.status === 'SELESAI' ? 'bg-green-50 text-green-600' : 
                    item.status === 'PROSES' ? 'bg-orange-50 text-orange-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {item.status === 'SELESAI' ? <CheckCircle2 size={24}/> : 
                     item.status === 'PROSES' ? <Clock size={24}/> : 
                     <AlertCircle size={24}/>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-extrabold text-[15px] text-black truncate">{item.judul}</h3>
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full uppercase">
                        {parsed.category}
                      </span>
                    </div>
                    
                    <p className="text-[12px] text-gray-500 font-medium flex flex-wrap gap-x-3 gap-y-1">
                      <span>Oleh: <strong className="text-gray-800">{item.user?.nama}</strong></span>
                      <span>•</span>
                      <span>NIK: {item.user?.nik}</span>
                      <span>•</span>
                      <span>{new Date(item.createdAt).toLocaleDateString("id-ID")}</span>
                    </p>

                    <p className="text-[13px] text-gray-600 mt-2 line-clamp-2 leading-relaxed">
                      {parsed.details}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 justify-end">
                  <button 
                    onClick={() => setSelectedComplaint(item)}
                    className="text-[11px] font-bold px-4 py-2 border border-gray-200 rounded-lg text-black hover:bg-gray-50 shadow-sm transition-colors"
                  >
                    Buka Detail
                  </button>
                  <div className="flex gap-1.5">
                    {item.status !== 'PROSES' && item.status !== 'SELESAI' && (
                      <button 
                        onClick={() => updateStatus(item.id, 'PROSES')} 
                        className="text-[11px] font-bold px-3 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        PROSES
                      </button>
                    )}
                    {item.status !== 'SELESAI' && (
                      <button 
                        onClick={() => openSelesaikanModal(item)} 
                        className="text-[11px] font-bold px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        SELESAI
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedComplaint && isMounted && createPortal(
        (() => {
          const parsed = parseComplaintBody(selectedComplaint.isi);
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4 animate-fade-in">
              <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-scale-up">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Detail Laporan</span>
                    <span className="text-[10px] text-gray-400 font-medium">ID Pengaduan: #{selectedComplaint.id}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedComplaint(null)}
                    className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-black transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
                  
                  {/* Title and Category */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-extrabold bg-black text-white px-3 py-1 rounded-full uppercase tracking-wider">
                        {parsed.category}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        selectedComplaint.status === 'SELESAI' ? 'bg-green-50 text-green-700' :
                        selectedComplaint.status === 'PROSES' ? 'bg-orange-50 text-orange-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {selectedComplaint.status}
                      </span>
                    </div>
                    <h2 className="text-2xl font-extrabold text-black leading-snug">{selectedComplaint.judul}</h2>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 text-[13px] font-medium text-gray-600">
                    <div className="flex items-center gap-2.5">
                      <User size={16} className="text-gray-400" />
                      <span>Pelapor: <strong className="text-black">{selectedComplaint.user?.nama}</strong></span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} className="text-gray-400" />
                      <span>NIK: <strong className="text-black">{selectedComplaint.user?.nik}</strong></span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Mail size={16} className="text-gray-400" />
                      <span className="truncate">Email: <strong className="text-black">{selectedComplaint.user?.email}</strong></span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Calendar size={16} className="text-gray-400" />
                      <span>Kejadian: <strong className="text-black">{parsed.date || new Date(selectedComplaint.createdAt).toLocaleDateString("id-ID")}</strong></span>
                    </div>
                    <div className="flex items-center gap-2.5 sm:col-span-2">
                      <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">Lokasi: <strong className="text-black">{parsed.location || "Tidak dicantumkan"}</strong></span>
                    </div>
                  </div>

                  {/* Complaint Text */}
                  <div>
                    <h4 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">Isi Keluhan</h4>
                    <p className="text-[14px] text-gray-700 leading-relaxed bg-white border border-gray-100 p-4 rounded-xl shadow-sm whitespace-pre-line">
                      {parsed.details}
                    </p>
                  </div>

                  {/* Attached Photo */}
                  {selectedComplaint.foto ? (
                    <div>
                      <h4 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <ImageIcon size={14} /> Lampiran Bukti Foto
                      </h4>
                      <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm bg-gray-50 flex items-center justify-center p-2 group cursor-pointer max-h-72">
                        <img 
                          src={selectedComplaint.foto} 
                          alt="Bukti Pengaduan" 
                          className="max-h-64 object-contain rounded-lg transition-transform group-hover:scale-[1.02] duration-300"
                          onClick={() => window.open(selectedComplaint.foto, "_blank")}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium mt-1.5 block text-center">Klik foto untuk melihat ukuran penuh</span>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-xs font-semibold flex flex-col items-center gap-1.5">
                      <ImageIcon size={24} className="text-gray-300" />
                      Tidak ada lampiran foto dalam pengaduan ini
                    </div>
                  )}

                  {/* Bukti Penyelesaian (Jika Laporan Sudah Selesai) */}
                  {selectedComplaint.status === 'SELESAI' && (
                    <div className="bg-green-50/70 border border-green-200 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-green-200/60 pb-2">
                        <h4 className="text-[11px] font-extrabold text-green-900 uppercase tracking-widest flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-green-600" /> Tanggapan Penyelesaian
                        </h4>
                        {selectedComplaint.selesaiAt && (
                          <span className="text-[11px] font-medium text-green-800">
                            Selesai: {new Date(selectedComplaint.selesaiAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-green-800 uppercase tracking-wider block mb-1">
                          Tindak Lanjut / Solusi:
                        </span>
                        <p className="text-[13px] text-gray-800 leading-relaxed bg-white/90 border border-green-100 p-3.5 rounded-lg whitespace-pre-line font-medium shadow-sm">
                          {selectedComplaint.catatanSelesai || "Belum ada tanggapan tercatat."}
                        </p>
                      </div>

                      {selectedComplaint.fotoSelesai ? (
                        <div className="mt-1">
                          <h5 className="text-[10px] font-extrabold text-green-900 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <ImageIcon size={13} /> Foto Bukti Penyelesaian
                          </h5>
                          <div className="border border-green-200 rounded-xl overflow-hidden shadow-sm bg-white flex items-center justify-center p-2 group cursor-pointer max-h-72">
                            <img 
                              src={selectedComplaint.fotoSelesai} 
                              alt="Bukti Selesai" 
                              className="max-h-64 object-contain rounded-lg transition-transform group-hover:scale-[1.02] duration-300"
                              onClick={() => window.open(selectedComplaint.fotoSelesai, "_blank")}
                            />
                          </div>
                          <span className="text-[10px] text-green-800 font-medium mt-1.5 block text-center">Klik foto untuk melihat ukuran penuh</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-green-700 italic bg-green-100/40 p-2.5 rounded-lg border border-green-200/50">
                          Penyelesaian ini tidak memerlukan lampiran foto fisik (misalnya tindak lanjut pelayanan/koordinasi).
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Modal Footer Actions */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-gray-50/50 flex flex-wrap sm:flex-nowrap justify-end items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium mr-auto w-full sm:w-auto mb-1 sm:mb-0">Ubah status tindak lanjut:</span>
                  
                  {selectedComplaint.status !== 'PROSES' && selectedComplaint.status !== 'SELESAI' && (
                    <button 
                      onClick={() => updateStatus(selectedComplaint.id, 'PROSES')}
                      className="bg-orange-50 hover:bg-orange-100 text-orange-700 px-4 py-2 rounded-lg text-xs font-extrabold shadow-sm transition-colors"
                    >
                      Tandai Proses
                    </button>
                  )}
                  
                  {selectedComplaint.status !== 'SELESAI' && (
                    <button 
                      onClick={() => openSelesaikanModal(selectedComplaint)}
                      className="bg-green-50 hover:bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-extrabold shadow-sm transition-colors"
                    >
                      Tandai Selesai
                    </button>
                  )}

                  <button 
                    onClick={() => setSelectedComplaint(null)}
                    className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-extrabold shadow-sm transition-colors"
                  >
                    Tutup
                  </button>
                </div>

              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* MODAL FORM PENYELESAIAN LAPORAN */}
      {resolvingComplaint && isMounted && createPortal(
        (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-2 sm:p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-scale-up border border-gray-100">
              
              {/* Header */}
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/70">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tindak Lanjut Akhir</span>
                  <h3 className="text-base sm:text-lg font-extrabold text-black">Selesaikan Laporan #{resolvingComplaint.id}</h3>
                </div>
                <button 
                  type="button"
                  onClick={closeSelesaikanModal}
                  className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-black transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={submitSelesaikan} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
                <div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Judul Laporan</span>
                  <p className="text-sm font-bold text-gray-800 line-clamp-2">{resolvingComplaint.judul}</p>
                </div>

                {/* Catatan Selesai (Wajib, 10 - 2000 chars) */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label htmlFor="catatanSelesai" className="text-xs font-bold text-gray-700">
                      Tanggapan / Tindak Lanjut <span className="text-red-500">*</span>
                    </label>
                    <span className={`text-[11px] font-bold ${
                      catatanSelesai.trim().length < 10 
                        ? "text-red-500" 
                        : catatanSelesai.trim().length > 2000 
                        ? "text-red-600" 
                        : "text-gray-400"
                    }`}>
                      {catatanSelesai.length} / 2000 karakter
                    </span>
                  </div>
                  <textarea
                    id="catatanSelesai"
                    rows={4}
                    required
                    minLength={10}
                    maxLength={2000}
                    value={catatanSelesai}
                    onChange={(e) => setCatatanSelesai(e.target.value)}
                    placeholder="Tuliskan tindakan atau penyelesaian yang telah dilakukan secara jelas dan terperinci (minimal 10 karakter)..."
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-medium outline-none focus:border-black focus:ring-1 focus:ring-black transition-all placeholder:text-gray-400 leading-relaxed resize-y min-h-[100px]"
                  />
                  {catatanSelesai.trim().length > 0 && catatanSelesai.trim().length < 10 && (
                    <p className="text-[11px] text-red-500 mt-1 font-medium">Tanggapan minimal 10 karakter.</p>
                  )}
                </div>

                {/* Foto Bukti Selesai (Opsional) */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Foto Bukti Penyelesaian <span className="text-gray-400 font-normal">(Opsional)</span>
                  </label>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Sertakan foto hasil pekerjaan lapangan untuk kategori fisik (Infrastruktur/Lingkungan). Maks 5MB (JPG, PNG, WEBP).
                  </p>

                  {fotoSelesaiPreview ? (
                    <div className="relative border border-gray-200 rounded-xl overflow-hidden p-2 bg-gray-50 flex flex-col items-center gap-2">
                      <img 
                        src={fotoSelesaiPreview} 
                        alt="Pratinjau Bukti" 
                        className="max-h-48 object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={removeFotoSelesai}
                        className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-1 bg-white border border-red-200 rounded-lg shadow-sm transition-colors"
                      >
                        Hapus Foto
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-gray-400 rounded-xl p-4 cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition-colors">
                      <ImageIcon className="w-6 h-6 text-gray-400 mb-1" />
                      <span className="text-xs font-bold text-gray-600">Pilih atau Seret Foto Bukti</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, atau WEBP hingga 5MB</span>
                      <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp" 
                        onChange={handleFotoSelesaiChange}
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                {resolutionError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600">
                    {resolutionError}
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={isSubmittingResolution}
                    onClick={closeSelesaikanModal}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingResolution || catatanSelesai.trim().length < 10 || catatanSelesai.trim().length > 2000}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isSubmittingResolution ? "Menyimpan..." : "Simpan & Selesaikan"}
                  </button>
                </div>
              </form>

            </div>
          </div>
        ),
        document.body
      )}

    </div>
  );
}