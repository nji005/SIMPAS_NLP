"use client";

import { useState } from "react";
import { Eye, EyeOff, ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-client";

export default function LupaSandiPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // Langkah 1: Input Email, Langkah 2: Input OTP + Sandi
  
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);

  // --- LANGKAH 1: MINTA KODE OTP ---
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: data.message });
        setTimeout(() => {
          setStep(2); // Pindah ke form input OTP
          setMessage({ type: "", text: "" });
        }, 1500);
      } else {
        setMessage({ type: "error", text: data.message || "Gagal meminta OTP." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  // --- LANGKAH 2: VERIFIKASI OTP & RESET PASWORD ---
  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otpCode, newPassword }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Sandi berhasil diubah! Mengalihkan..." });
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else {
        setMessage({ type: "error", text: data.message || "Gagal memproses." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex w-full min-h-screen bg-white items-center justify-center p-4 sm:p-6 relative">
      <Link href="/login" className="absolute top-6 left-6 sm:top-8 sm:left-8 text-sm text-gray-500 hover:text-black font-medium transition-colors min-h-[44px] flex items-center">
        ← Kembali ke Masuk
      </Link>

      <div className="w-full max-w-md mt-12 sm:mt-16 md:mt-0">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            {step === 1 ? <Mail className="w-8 h-8 text-black" /> : <ShieldCheck className="w-8 h-8 text-black" />}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {step === 1 ? "Lupa Kata Sandi" : "Verifikasi Keamanan"}
          </h1>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            {step === 1 
              ? "Masukkan email Anda untuk menerima 6 digit kode akses verifikasi." 
              : `Kode OTP telah dikirimkan ke email ${email}.`}
          </p>
        </div>

        {message.text && (
          <div className={`p-4 mb-6 rounded-md text-sm font-medium text-center ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {step === 1 ? (
          // FORM TAHAP 1: INPUT EMAIL
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-5 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-black uppercase tracking-wider">Email Akun</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nama@email.com" className="w-full bg-[#f4f4f5] border border-transparent focus:border-black focus:bg-white px-4 py-3.5 text-sm outline-none rounded-sm text-black" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-black text-white flex items-center justify-center gap-3 py-4 rounded-md mt-2 hover:bg-gray-800 transition-colors disabled:bg-gray-400">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-[11px] font-bold uppercase tracking-widest">Kirim Kode OTP</span>}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          // FORM TAHAP 2: INPUT OTP & KATA SANDI BARU
          <form onSubmit={handleVerifyAndReset} className="flex flex-col gap-5 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-black uppercase tracking-wider">Masukkan Kode OTP (6 Digit)</label>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required maxLength={6} placeholder="Contoh: 123456" className="w-full bg-[#f4f4f5] border border-transparent focus:border-black focus:bg-white px-4 py-3.5 text-sm outline-none rounded-sm text-center font-mono text-lg tracking-widest text-black" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-black uppercase tracking-wider">Kata Sandi Baru</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  required 
                  minLength={8}
                  placeholder="Minimal 8 karakter" 
                  className="w-full bg-[#f4f4f5] border border-transparent focus:border-black focus:bg-white px-4 py-3.5 text-sm outline-none rounded-sm pr-10 text-black" 
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-500 hover:text-black transition-colors" tabIndex={-1}>
                  {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-black text-white flex items-center justify-center gap-3 py-4 rounded-md mt-2 hover:bg-gray-800 transition-colors disabled:bg-gray-400">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-[11px] font-bold uppercase tracking-widest">Verifikasi & Ubah Sandi</span>}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => setStep(1)} className="text-xs text-gray-500 hover:text-black text-center mt-2">
              Kirim ulang kode OTP baru
            </button>
          </form>
        )}
      </div>
    </main>
  );
}