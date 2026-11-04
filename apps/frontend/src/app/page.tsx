"use client";

import { useState, useEffect } from "react";
import { Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import { API_BASE_URL, getCurrentUser } from "@/lib/api-client";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [formData, setFormData] = useState({
    judul: "",
    isi: "",
    tanggal: "",
    lokasi: "",
    kategori: "lainnya"
  });

  // State baru khusus untuk menampung file foto
  const [foto, setFoto] = useState<File | null>(null);

  // State untuk klasifikasi otomatis NLP
  const [isPredicting, setIsPredicting] = useState(false);
  const [isAutoDetected, setIsAutoDetected] = useState(false);

  useEffect(() => {
    getCurrentUser().then((serverUser) => {
      if (serverUser) setUser(serverUser);
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Efek Debounce untuk klasifikasi otomatis kategori menggunakan NLP saat pengguna mengetik isi laporan
  useEffect(() => {
    const textToPredict = formData.isi.trim();

    // Reset status jika isi laporan kosong
    if (!textToPredict) {
      setIsAutoDetected(false);
      setFormData(prev => ({ ...prev, kategori: "lainnya" }));
      return;
    }

    // Jangan lakukan klasifikasi otomatis jika teks laporan terlalu pendek (kurang dari 15 karakter)
    if (textToPredict.length < 15) {
      setIsAutoDetected(false);
      setFormData(prev => ({ ...prev, kategori: "lainnya" }));
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsPredicting(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/predict`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: textToPredict }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.category && !data.uncertain) {
            setFormData((prev) => ({ ...prev, kategori: data.category }));
            setIsAutoDetected(true);
          } else {
            setFormData((prev) => ({ ...prev, kategori: "lainnya" }));
            setIsAutoDetected(false);
          }
        } else {
          setFormData((prev) => ({ ...prev, kategori: "lainnya" }));
          setIsAutoDetected(false);
        }
      } catch (error) {
        console.error("Gagal melakukan prediksi NLP:", error);
        setFormData((prev) => ({ ...prev, kategori: "lainnya" }));
        setIsAutoDetected(false);
      } finally {
        setIsPredicting(false);
      }
    }, 800); // Kirim request setelah 800ms berhenti mengetik

    return () => clearTimeout(delayDebounceFn);
  }, [formData.isi]);

  // Fungsi menangkap file yang dipilih
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setMessage({ type: "error", text: "Anda harus MASUK (Login) terlebih dahulu untuk membuat laporan!" });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: "", text: "" });

    // Gunakan FormData asli dari browser untuk mengirim file
    const formDataToSend = new FormData();
    formDataToSend.append("judul", formData.judul);
    formDataToSend.append("isi", formData.isi);
    formDataToSend.append("tanggal", formData.tanggal);
    formDataToSend.append("lokasi", formData.lokasi);
    formDataToSend.append("kategori", formData.kategori || "lainnya");
    formDataToSend.append("userId", user.id.toString());

    if (foto) {
      formDataToSend.append("foto", foto);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/laporan`, {
        method: "POST",
        credentials: "include",
        // PENTING: Jangan tulis headers Content-Type di sini jika mengirim file
        body: formDataToSend,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Laporan beserta foto berhasil terkirim!" });
        setFormData({ judul: "", isi: "", tanggal: "", lokasi: "", kategori: "lainnya" });
        setFoto(null); // Kosongkan file
        setIsAutoDetected(false); // Reset status deteksi otomatis

        // Hilangkan pesan secara otomatis setelah 3 detik (3000 milidetik)
        setTimeout(() => {
          setMessage({ type: "", text: "" });
        }, 3000);

      } else {
        setMessage({ type: "error", text: data.message || "Gagal mengirim laporan." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Tambahkan pt-16 di tag main ini
    <main className="min-h-screen text-black pt-16 animate-fade-in">
      {message.text && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-md shadow-lg text-sm font-bold w-[90vw] md:w-auto max-w-md md:max-w-none text-center md:text-left animate-in fade-in slide-in-from-top-5 ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* SECTION HERO */}
      <section className="relative w-full min-h-[100svh] md:h-screen flex flex-col justify-center px-4 sm:px-8 md:px-16 lg:px-24">
        <div className="absolute inset-0 z-0 bg-gray-800 bg-center bg-cover" style={{ backgroundImage: "url('/SIPMAS.jpg')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-black/10 to-transparent z-0" />

        <div className="relative z-10 max-w-6xl mx-auto w-full md:-translate-x-8 lg:-translate-x-12">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-5 tracking-tight leading-[1.15] md:leading-[1.1] text-white drop-shadow-md">
            Lapor Cepat,<br />Wujudkan Perubahan.
          </h1>
          <p className="text-gray-100 mb-8 md:mb-10 max-w-lg leading-relaxed text-sm sm:text-base md:text-lg drop-shadow-md">
            Sampaikan keluhan terkait infrastruktur, lingkungan, dan layanan publik secara langsung. Laporan Anda diproses secara transparan.
          </p>
          <a href="#form-lapor" className="inline-block bg-white text-black px-6 sm:px-8 py-3.5 sm:py-4 rounded-md text-sm font-extrabold tracking-wider hover:bg-gray-200 transition-colors shadow-md text-center min-h-[44px]">
            BUAT LAPORAN BARU
          </a>
        </div>
      </section>

      {/* SECTION 2: FORM PENGADUAN */}
      <section id="form-lapor" className="min-h-screen px-4 sm:px-8 py-16 md:py-24 bg-gray-50 flex items-center justify-center">
        <div className="max-w-3xl w-full mx-auto">
          <div className="mb-8 md:mb-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Tulis Laporan Anda</h2>
            <p className="text-gray-500 text-sm sm:text-base mt-2 md:mt-3">Lengkapi detail di bawah ini agar sistem cerdas kami dapat memproses laporan Anda dengan tepat.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white p-5 sm:p-8 md:p-10 rounded-2xl shadow-xl border border-gray-100 flex flex-col gap-6 md:gap-8">

            {/* Input Data Teks (Sama seperti sebelumnya) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Judul Laporan <span className="text-red-500">*</span></label>
              <input type="text" name="judul" value={formData.judul} onChange={handleChange} required placeholder="Contoh: Jalan Berlubang di Cibeber" className="border border-gray-300 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Isi Laporan <span className="text-red-500">*</span></label>
              <textarea name="isi" value={formData.isi} onChange={handleChange} required rows={5} placeholder="Jelaskan detail keluhan Anda..." className="border border-gray-300 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition"></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Tanggal Kejadian <span className="text-red-500">*</span></label>
                <input type="date" name="tanggal" value={formData.tanggal} onChange={handleChange} required className="border border-gray-300 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition text-gray-700" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Lokasi Kejadian <span className="text-red-500">*</span></label>
                <input type="text" name="lokasi" value={formData.lokasi} onChange={handleChange} required placeholder="Ketik lokasi kejadian.." className="border border-gray-300 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Kategori Laporan (Terdeteksi Otomatis)</label>
              <div className="border border-gray-300 rounded-md px-4 py-3 text-sm bg-gray-50 text-gray-700 min-h-[50px] flex items-center font-bold transition">
                {isPredicting ? (
                  <span className="flex items-center gap-2 text-gray-500 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-black" /> Menganalisis laporan menggunakan NLP...
                  </span>
                ) : formData.kategori && formData.kategori !== "lainnya" && isAutoDetected ? (
                  <span className="text-green-700 flex items-center gap-1.5 animate-fade-in">
                    Kategori: <span className="underline uppercase tracking-wide">
                      {formData.kategori === "infrastruktur" ? "Infrastruktur & Fasilitas Umum" :
                        formData.kategori === "lingkungan" ? "Lingkungan & Kebersihan" :
                          formData.kategori === "pelayanan" ? "Pelayanan Publik" : formData.kategori}
                    </span>
                  </span>
                ) : (
                  <span className="text-gray-500 font-medium">Lainnya (belum terdeteksi otomatis)</span>
                )}
              </div>
              {/* Kirim kategori tersembunyi agar backend Next.js tetap menerima data kategori */}
              <input type="hidden" name="kategori" value={formData.kategori || "lainnya"} />
            </div>

            {/* FUNGSI UPLOAD FOTO YANG SUDAH AKTIF */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Unggah Foto Bukti</label>
              <div className="relative border-2 border-dashed border-gray-300 rounded-md p-6 sm:p-10 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition cursor-pointer group">
                {/* Input tipe file tersembunyi */}
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/jpg"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {foto ? (
                  <div className="flex flex-col items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-10 h-10" />
                    <span className="text-sm font-bold">{foto.name}</span>
                    <span className="text-xs text-gray-500">Klik lagi untuk mengganti foto</span>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-gray-400 mb-3 group-hover:text-black transition-colors" />
                    <span className="text-sm font-medium text-gray-700">Klik atau seret file ke sini</span>
                    <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Maksimal 5MB (JPG/PNG)</span>
                  </>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={isLoading} className="w-full sm:w-auto bg-black text-white px-8 py-3.5 sm:py-4 min-h-[44px] rounded-md text-sm font-bold hover:bg-gray-800 transition-colors tracking-wide shadow-md flex items-center justify-center gap-2 disabled:bg-gray-400">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "KIRIM LAPORAN"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}