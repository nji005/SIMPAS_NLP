"use client";

import { useState } from "react";
import { Eye, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { API_BASE_URL } from "@/lib/api-client";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("masuk");
  const [regStep, setRegStep] = useState(1); // 1: Form Daftar, 2: Input OTP

  const [formData, setFormData] = useState({ nik: "", nama: "", email: "", password: "" });
  const [otpCode, setOtpCode] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- TAHAP 1 DAFTAR: KIRIM DATA & MINTA OTP ---
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    const { nik, nama, email, password } = formData;

    // 1. Validasi NIK (Harus 16 digit angka)
    if (!/^\d{16}$/.test(nik)) {
      setMessage({ type: "error", text: "NIK harus terdiri dari 16 digit angka!" });
      return;
    }

    // 2. Validasi Nama (Hanya huruf/spasi)
    if (!/^[a-zA-Z\s]+$/.test(nama)) {
      setMessage({ type: "error", text: "Nama lengkap hanya boleh berisi huruf dan spasi!" });
      return;
    }

    // 3. Validasi Email (Format email valid)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: "error", text: "Format email tidak valid!" });
      return;
    }

    // 4. Validasi Sandi (Minimal 8 karakter)
    if (password.length < 8) {
      setMessage({ type: "error", text: "Kata sandi harus minimal 8 karakter!" });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: data.message });
        setTimeout(() => { setRegStep(2); setMessage({ type: "", text: "" }); }, 1500);
      } else {
        setMessage({ type: "error", text: data.message || "Gagal mendaftar." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  // --- TAHAP 2 DAFTAR: VERIFIKASI OTP ---
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, otpCode }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Pendaftaran berhasil! Silakan masuk." });
        setTimeout(() => {
          setActiveTab("masuk");
          setRegStep(1);
          setOtpCode("");
          setFormData({ nik: "", nama: "", email: "", password: "" });
        }, 2000);
      } else {
        setMessage({ type: "error", text: data.message || "OTP tidak valid." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNGSI MASUK (LOGIN) ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Berhasil masuk! Mengalihkan..." });
        localStorage.setItem("user", JSON.stringify(data.user));
        setTimeout(() => {
          if (data.user.role === "ADMIN") {
            window.location.href = "/admin";
          } else {
            window.location.href = "/";
          }
        }, 1500);
      } else {
        setMessage({ type: "error", text: data.message || "Gagal masuk." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan jaringan." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex w-full min-h-screen">
      <section className="hidden md:flex md:w-5/12 lg:w-1/2 flex-col relative items-center justify-center sticky top-0 h-screen overflow-hidden">
        <Image
          src="/login.jpg"
          alt="SIPMAS Pelayanan Pengaduan"
          fill
          priority
          sizes="(max-width: 768px) 0vw, (max-width: 1024px) 42vw, 50vw"
          className="object-cover object-center"
        />
      </section>

      <section className="w-full md:w-7/12 lg:w-1/2 bg-white flex flex-col items-center justify-center p-6 sm:p-12 lg:p-24 relative min-h-screen">
        <Link href="/" className="absolute top-6 left-6 md:top-8 md:left-8 text-sm text-gray-400 hover:text-black transition-colors z-10 min-h-[44px] flex items-center">← Kembali</Link>

        <div className="w-full max-w-md mt-12 sm:mt-16 md:mt-0">
          <div className="flex border-b border-gray-200 mb-10">
            <button onClick={() => { setActiveTab("masuk"); setRegStep(1); setMessage({ type: "", text: "" }); }} className={`flex-1 pb-4 text-sm font-bold transition-colors ${activeTab === "masuk" ? "border-b-2 border-black text-black" : "text-gray-400"}`}>Masuk</button>
            <button onClick={() => { setActiveTab("daftar"); setMessage({ type: "", text: "" }); }} className={`flex-1 pb-4 text-sm font-bold transition-colors ${activeTab === "daftar" ? "border-b-2 border-black text-black" : "text-gray-400"}`}>Daftar</button>
          </div>

          <div className="min-h-[480px]">
            {message.text && (
              <div className={`p-4 mb-6 rounded-md text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            {activeTab === "daftar" ? (
              regStep === 1 ? (
                <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4 animate-fade-in">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Buat Akun Baru</h1>
                  {/* ... Input NIK, Nama, Email, Password ... */}
                  <input type="text" name="nik" value={formData.nik} onChange={handleChange} required maxLength={16} pattern="\d{16}" title="NIK harus terdiri dari 16 digit angka" placeholder="16 Digit NIK" className="bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black" />
                  <input type="text" name="nama" value={formData.nama} onChange={handleChange} required pattern="[a-zA-Z\s]+" title="Nama lengkap hanya boleh berisi huruf dan spasi" placeholder="Nama Lengkap Sesuai KTP" className="bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black" />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="Email Aktif" className="bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black" />
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} required minLength={8} placeholder="Kata Sandi (Min 8 Karakter)" className="w-full bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-500 hover:text-black"><Eye className="w-5 h-5" /></button>
                  </div>
                  <button type="submit" disabled={isLoading} className="w-full bg-black text-white py-4 rounded-md mt-4 hover:bg-gray-800 transition-colors flex justify-center items-center gap-2">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "KIRIM OTP VERIFIKASI"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5 animate-fade-in">
                  <div className="flex flex-col items-center mb-4 text-center">
                    <ShieldCheck className="w-12 h-12 text-black mb-3" />
                    <h1 className="text-2xl font-bold text-gray-900">Verifikasi Email</h1>
                    <p className="text-sm text-gray-500 mt-2">Kode OTP 6 digit telah dikirim ke <br /><b>{formData.email}</b></p>
                  </div>
                  <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required maxLength={6} placeholder="Masukkan 6 Digit OTP" className="w-full bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-center font-mono text-xl tracking-[0.5em] text-black" />
                  <button type="submit" disabled={isLoading} className="w-full bg-black text-white py-4 rounded-md mt-2 hover:bg-gray-800 transition-colors flex justify-center items-center gap-2">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "VERIFIKASI & SELESAI"}
                  </button>
                  <button type="button" onClick={() => setRegStep(1)} className="text-xs text-gray-500 hover:text-black text-center mt-2">Kembali ke formulir pendaftaran</button>
                </form>
              )
            ) : (
              <form onSubmit={handleLogin} className="flex flex-col gap-4 animate-fade-in">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Selamat Datang Kembali</h1>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="nama@email.com" className="bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black" />
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} required placeholder="••••••••" className="w-full bg-[#f4f4f5] px-4 py-3.5 text-sm outline-none rounded-sm text-black pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-500 hover:text-black"><Eye className="w-5 h-5" /></button>
                </div>
                <div className="flex justify-end"><Link href="/lupa-sandi" className="text-[10px] text-gray-500 hover:text-black">Lupa Sandi?</Link></div>
                <button type="submit" disabled={isLoading} className="w-full bg-black text-white py-4 rounded-md mt-2 hover:bg-gray-800 transition-colors flex justify-center items-center gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "MASUK"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}