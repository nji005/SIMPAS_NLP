"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation"; // Pelacak halaman
import { Menu, X } from "lucide-react";
import { getCurrentUser, logoutUser } from "@/lib/api-client";

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Efek ini akan otomatis berjalan SETIAP KALI Anda pindah halaman
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      const serverUser = await getCurrentUser();
      if (!isMounted) return;
      if (serverUser) {
        setUser((prevUser: any) => {
          if (!prevUser || prevUser.id !== serverUser.id || prevUser.role !== serverUser.role || prevUser.nama !== serverUser.nama) {
            return serverUser;
          }
          return prevUser;
        });
      } else {
        setUser((prevUser: any) => (prevUser !== null ? null : prevUser));
      }
    }
    checkSession();
    setIsMobileMenuOpen(false); // Tutup menu mobile saat navigasi
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  // Tutup menu mobile saat tombol Esc ditekan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // LOGIKA PINTAR: Jika sedang di halaman login, hilangkan Navbar!
  if (pathname === "/login" || pathname === "/lupa-sandi" || pathname.startsWith("/admin")) {
    return null;
  }

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    window.location.href = "/login"; // Memaksa browser muat ulang bersih ke halaman login
  };

  return (
    <>
      <header className="w-full bg-white shadow-sm px-4 md:px-8 py-4 flex justify-between items-center fixed top-0 left-0 right-0 z-50">
        <Link href="/" className="flex items-center">
          <Image
            src="/LOGO.png"
            alt="SIPMAS"
            width={135}
            height={36}
            className="h-8 md:h-9 w-auto object-contain"
            priority
          />
        </Link>
        
        <nav className="hidden md:flex gap-8 items-center absolute left-1/2 -translate-x-1/2">
          {[
            { href: "/", label: "Beranda" },
            { href: "/user/riwayat", label: "Riwayat" },
            { href: "/user/statistik", label: "Statistik" },
            { href: "/user/panduan", label: "Panduan" },
          ].map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/user/riwayat" && pathname.startsWith("/user/riwayat/"));
            return (
              <Link 
                key={item.href}
                href={item.href} 
                className={`relative py-1 text-sm font-bold tracking-wide transition-all duration-300 ${
                  isActive 
                    ? "text-black" 
                    : "text-gray-400 hover:text-gray-900"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-full animate-fade-in" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* BLOK KANAN: DESKTOP & TOMBOL HAMBURGER MOBILE */}
        <div className="flex items-center gap-3">
          {/* Tampilan Desktop (>= md) */}
          <div className="hidden md:flex items-center gap-5">
            {user ? (
              <>
                {user.role === "ADMIN" && (
                  <Link 
                    href="/admin" 
                    className="text-xs font-bold bg-black text-white px-4 py-2.5 rounded-full hover:bg-gray-800 transition-all shadow-sm"
                  >
                    Panel Admin
                  </Link>
                )}
                <span className="text-sm font-bold text-gray-800 bg-gray-100 px-4 py-2 rounded-full">
                  Halo, {user.nama}
                </span>
                <button 
                  onClick={handleLogout}
                  className="text-sm font-bold text-red-600 hover:text-red-800 transition-colors"
                >
                  Keluar
                </button>
              </>
            ) : (
              <Link href="/login" className="text-sm font-bold text-black hover:text-gray-600">
                Masuk
              </Link>
            )}
          </div>

          {/* Tombol Hamburger Mobile (< md) */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            className="md:hidden p-2 text-gray-700 hover:text-black focus:outline-none cursor-pointer"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* BACKDROP OVERLAY DI MOBILE (< md) */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)} 
          className="fixed inset-0 bg-black/40 z-40 md:hidden animate-fade-in" 
        />
      )}

      {/* DROPDOWN MENU MOBILE (< md) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[64px] bg-white border-b border-gray-200 shadow-xl px-6 py-6 flex flex-col gap-4 animate-fade-in z-50 max-h-[calc(100vh-64px)] overflow-y-auto">
          {user && (
            <div className="pb-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 bg-gray-100 px-3.5 py-1.5 rounded-full">
                Halo, {user.nama}
              </span>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-xs font-bold bg-black text-white px-3.5 py-1.5 rounded-full hover:bg-gray-800 transition-all shadow-sm"
                >
                  Panel Admin
                </Link>
              )}
            </div>
          )}

          <nav className="flex flex-col gap-2">
            {[
              { href: "/", label: "Beranda" },
              { href: "/user/riwayat", label: "Riwayat" },
              { href: "/user/statistik", label: "Statistik" },
              { href: "/user/panduan", label: "Panduan" },
            ].map((item) => {
              const isActive =
              pathname === item.href ||
              (item.href === "/user/riwayat" && pathname.startsWith("/user/riwayat/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`py-2 px-3 text-sm font-bold rounded-md transition-colors ${
                    isActive
                      ? "bg-gray-100 text-black"
                      : "text-gray-600 hover:bg-gray-50 hover:text-black"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full text-left py-2.5 px-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              >
                Keluar
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-center text-sm font-bold bg-black text-white py-3 rounded-full hover:bg-gray-800 transition-all shadow-sm"
              >
                Masuk
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}