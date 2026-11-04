"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, MessageSquare, 
  PieChart, Users, FileText, LogOut, Loader2,
  Menu, X
} from "lucide-react";
import { getCurrentUser, logoutUser } from "@/lib/api-client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    async function verifyAdminSession() {
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      if (user.role !== "ADMIN") {
        window.location.href = "/";
        return;
      }
      setCurrentUser(user);
      setIsAuthorized(true);
    }
    verifyAdminSession();
  }, []);

  // Tutup drawer saat rute berpindah
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Tutup drawer saat tombol Esc ditekan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    window.location.href = "/login";
  };

  const getLinkClass = (href: string) => {
    const isActive = pathname === href;
    return `flex items-center gap-3.5 px-4 py-2.5 text-[13px] font-bold rounded-md transition-all ${
      isActive 
        ? "text-white bg-black shadow-md" 
        : "text-gray-600 hover:bg-gray-200 hover:text-black"
    }`;
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] flex flex-col items-center justify-center font-sans text-black">
        <Loader2 className="w-10 h-10 animate-spin text-black mb-4" />
        <p className="text-sm font-semibold text-gray-500">Memeriksa hak akses...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex font-sans text-black">
      
      {/* OVERLAY DRAWER DI MOBILE (< lg) */}
      {isDrawerOpen && (
        <div 
          onClick={() => setIsDrawerOpen(false)} 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity" 
        />
      )}

      {/* SIDEBAR (DRAWER DI MOBILE, FIXED DI DESKTOP >= lg) */}
      <aside 
        className={`w-[260px] bg-[#f4f5f7] border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-[72px] flex items-center justify-between px-8 bg-white border-b border-gray-200">
          <Link href="/" className="flex items-center" onClick={() => setIsDrawerOpen(false)}>
            <Image
              src="/LOGO.png"
              alt="SIPMAS"
              width={135}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>
          <button 
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Tutup menu"
            className="lg:hidden p-1 text-gray-500 hover:text-black"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="px-8 py-6">
          <h2 className="text-[15px] font-bold text-gray-900">Admin Panel</h2>
          <p className="text-[11px] text-gray-500 font-medium mt-1 uppercase tracking-wider">
            Administrator
          </p>
        </div>

        <nav className="flex-1 px-4 flex flex-col gap-1.5">
          <Link href="/admin" onClick={() => setIsDrawerOpen(false)} className={getLinkClass("/admin")}>
            <LayoutDashboard size={18} strokeWidth={2.5} /> Dashboard
          </Link>
          <Link href="/admin/complaints" onClick={() => setIsDrawerOpen(false)} className={getLinkClass("/admin/complaints")}>
            <MessageSquare size={18} strokeWidth={2.5} /> Complaints
          </Link>
          <Link href="/admin/analytics" onClick={() => setIsDrawerOpen(false)} className={getLinkClass("/admin/analytics")}>
            <PieChart size={18} strokeWidth={2.5} /> Analytics
          </Link>
          <Link href="/admin/users" onClick={() => setIsDrawerOpen(false)} className={getLinkClass("/admin/users")}>
            <Users size={18} strokeWidth={2.5} /> Users
          </Link>
          <Link href="/admin/reports" onClick={() => setIsDrawerOpen(false)} className={getLinkClass("/admin/reports")}>
            <FileText size={18} strokeWidth={2.5} /> Reports
          </Link>
        </nav>

        <div className="px-4 py-6 border-t border-gray-200 flex flex-col gap-1.5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3.5 px-4 py-2.5 text-[13px] font-bold text-gray-600 rounded-md hover:bg-gray-200 hover:text-black transition-colors">
            <LogOut size={18} strokeWidth={2.5} /> Logout
          </button>
        </div>
      </aside>

      {/* KONTEN UTAMA */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-h-screen w-full">
        
        {/* TOPBAR */}
        <header className="h-[72px] bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-10 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Buka menu"
              className="lg:hidden p-2 text-gray-700 hover:text-black focus:outline-none"
            >
              <Menu size={22} />
            </button>
            <span className="text-xs sm:text-sm font-bold text-gray-700 truncate">
              Selamat datang, <span className="text-black font-extrabold">{currentUser?.nama}</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-black border border-gray-200 flex items-center justify-center text-white text-xs font-bold uppercase shrink-0">
               {currentUser?.nama?.charAt(0) || "A"}
            </div>
          </div>
        </header>

        {/* HALAMAN DINAMIS */}
        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-x-hidden animate-fade-in" key={pathname}>
          {children}
        </main>
      </div>
      
    </div>
  );
}