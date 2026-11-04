import { FileText, Send, Clock, CheckCircle, AlertTriangle, UserPlus, Mail } from "lucide-react";

export default function Panduan() {
  const alurPendaftaran = [
    {
      ikon: <UserPlus className="w-6 h-6 text-black" />,
      judul: "1. Isi Formulir Pendaftaran",
      deskripsi: "Masukkan NIK (wajib 16 digit angka), Nama Lengkap (hanya huruf & spasi), Email Aktif Anda, dan buat Kata Sandi minimal 8 karakter."
    },
    {
      ikon: <Mail className="w-6 h-6 text-black" />,
      judul: "2. Verifikasi Kode OTP",
      deskripsi: "Sistem akan mengirimkan 6 digit kode OTP ke email terdaftar. Buka pesan masuk email Anda, salin kode tersebut, dan masukkan ke kolom verifikasi untuk mengaktifkan akun."
    }
  ];

  const alurLaporan = [
    {
      ikon: <FileText className="w-6 h-6 text-black" />,
      judul: "1. Tulis Laporan",
      deskripsi: "Jelaskan keluhan Anda dengan detail. Sertakan foto bukti dan lokasi kejadian yang akurat agar masalah mudah diverifikasi oleh petugas di lapangan."
    },
    {
      ikon: <Send className="w-6 h-6 text-black" />,
      judul: "2. Verifikasi Petugas",
      deskripsi: "Laporan Anda akan masuk ke antrean sistem kami dan diverifikasi oleh admin SIPMAS paling lambat 1x24 jam hari kerja."
    },
    {
      ikon: <Clock className="w-6 h-6 text-black" />,
      judul: "3. Sedang Diproses",
      deskripsi: "Setelah diverifikasi, laporan diteruskan ke instansi atau dinas terkait (misal: Dinas PUPR, Dinas Lingkungan Hidup) untuk segera ditindaklanjuti."
    },
    {
      ikon: <CheckCircle className="w-6 h-6 text-black" />,
      judul: "4. Selesai",
      deskripsi: "Petugas akan memperbarui status laporan menjadi 'Selesai' di sistem setelah masalah di lapangan berhasil ditangani sepenuhnya."
    }
  ];

  return (
    <main className="min-h-screen bg-[#f8fafc] text-black pt-20 md:pt-24 pb-16 px-4 sm:px-6 md:px-8 animate-fade-in">
      <div className="max-w-4xl mx-auto animate-fade-up">
        
        {/* Header Section */}
        <div className="text-center mb-10 md:mb-16">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-3 md:mb-4">Panduan Layanan</h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Pelajari cara melakukan pendaftaran akun, verifikasi, serta bagaimana sistem SIPMAS memproses laporan Anda.
          </p>
        </div>

        {/* Alur Pendaftaran & Verifikasi */}
        <div className="bg-white p-5 sm:p-8 md:p-12 rounded-2xl shadow-sm border border-gray-100 mb-6 md:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 md:mb-8 border-b border-gray-100 pb-4">Panduan Pendaftaran & Verifikasi</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            {alurPendaftaran.map((item, index) => (
              <div key={index} className="flex gap-4 sm:gap-5 items-start">
                <div className="bg-gray-50 border border-gray-100 p-3 sm:p-4 rounded-xl shrink-0 shadow-sm">
                  {item.ikon}
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg mb-1.5 md:mb-2 text-gray-900">{item.judul}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.deskripsi}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alur Penanganan Laporan */}
        <div className="bg-white p-5 sm:p-8 md:p-12 rounded-2xl shadow-sm border border-gray-100 mb-6 md:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 md:mb-8 border-b border-gray-100 pb-4">Alur Penanganan Laporan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            {alurLaporan.map((item, index) => (
              <div key={index} className="flex gap-4 sm:gap-5 items-start">
                <div className="bg-gray-50 border border-gray-100 p-3 sm:p-4 rounded-xl shrink-0 shadow-sm">
                  {item.ikon}
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg mb-1.5 md:mb-2 text-gray-900">{item.judul}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.deskripsi}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Syarat & Ketentuan Singkat */}
        <div className="bg-[#fffbeb] p-8 md:p-10 rounded-2xl shadow-sm border border-[#fde68a] flex flex-col md:flex-row gap-8 items-start">
           <div className="bg-[#fef3c7] p-4 rounded-full shrink-0">
             <AlertTriangle className="w-8 h-8 text-[#d97706]" />
           </div>
           <div>
             <h2 className="text-xl font-bold mb-4 text-[#92400e]">Hal yang Perlu Diperhatikan</h2>
             <ul className="list-disc list-outside ml-5 text-[#b45309] text-sm flex flex-col gap-3 leading-relaxed">
               <li>Pastikan data pendaftaran Anda valid (NIK harus 16 digit dan nama hanya mengandung huruf).</li>
               <li>Jaga kerahasiaan 6 digit kode OTP Anda, jangan berikan kepada siapapun termasuk petugas.</li>
               <li>Pastikan laporan yang Anda buat <strong>tidak mengandung</strong> unsur SARA, ujaran kebencian, atau informasi hoaks.</li>
               <li>Gunakan bahasa Indonesia yang baik, jelas, dan mudah dipahami oleh petugas.</li>
               <li>Sertakan bukti foto yang relevan dan terbaru (diambil langsung dari lokasi, bukan dari internet).</li>
               <li>Pantau perkembangan dan status laporan Anda secara berkala melalui menu <strong>Riwayat</strong> di navigasi atas.</li>
             </ul>
           </div>
        </div>

      </div>
    </main>
  );
}