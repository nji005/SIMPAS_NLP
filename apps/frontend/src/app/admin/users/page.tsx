"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("SEMUA");
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Gagal mengambil data pengguna:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, currentRole: string, newRole: string) => {
    if (currentRole === newRole) return;
    
    // Prevent self-demotion if they are logged in as this user (optional client-side warning)
    const loggedInUserStr = localStorage.getItem("user");
    if (loggedInUserStr) {
      const loggedInUser = JSON.parse(loggedInUserStr);
      if (loggedInUser.id === userId && newRole !== "ADMIN") {
        const confirmDemote = window.confirm("Peringatan: Anda sedang mengubah role Anda sendiri dari ADMIN. Anda mungkin akan kehilangan akses ke dashboard ini. Lanjutkan?");
        if (!confirmDemote) return;
      }
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role: newRole }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: data.message || "Role berhasil diubah!" });
        fetchUsers(); // Refresh list
        
        // If updating self, reload so layout picks up the changes
        if (loggedInUserStr) {
          const loggedInUser = JSON.parse(loggedInUserStr);
          if (loggedInUser.id === userId) {
            loggedInUser.role = newRole;
            localStorage.setItem("user", JSON.stringify(loggedInUser));
            if (newRole === "WARGA") {
              window.location.href = "/";
            } else {
              window.location.reload();
            }
          }
        }
      } else {
        setMessage({ type: "error", text: data.message || "Gagal mengubah role." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Terjadi kesalahan koneksi server." });
    }

    // Auto-clear message
    setTimeout(() => {
      setMessage({ type: "", text: "" });
    }, 4000);
  };

  // Filter & Search Logic
  const filteredUsers = users.filter((u) => {
    const matchesRole = roleFilter === "SEMUA" || u.role === roleFilter;
    
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      u.nama.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      u.nik.includes(searchLower);

    return matchesRole && matchesSearch;
  });

  return (
    <div className="max-w-6xl w-full animate-fade-up">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-black mb-2">Manajemen Pengguna</h1>
          <p className="text-gray-500 font-medium text-sm sm:text-base">Kelola data warga terdaftar dan atur hak akses administrator.</p>
        </div>
        
        {/* Role Filters */}
        <div className="flex gap-1 bg-white p-1 rounded-full border border-gray-200 shadow-sm max-w-full overflow-x-auto">
          {["SEMUA", "WARGA", "ADMIN"].map((r) => (
            <button 
              key={r} 
              onClick={() => setRoleFilter(r)}
              className={`px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all whitespace-nowrap shrink-0 ${
                roleFilter === r 
                  ? 'bg-black text-white shadow-sm' 
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* FEEDBACK MESSAGE */}
      {message.text && (
        <div className={`p-4 mb-6 rounded-xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-300 ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* SEARCH INPUT */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari pengguna berdasarkan nama, email, atau NIK..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[13px] font-medium outline-none focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* USERS TABLE */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse animate-shimmer">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Nama & NIK</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Status Akun</th>
                  <th className="px-6 py-4">Role Akses</th>
                  <th className="px-6 py-4 text-right">Ubah Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-32 bg-gray-200/60 rounded"></div>
                        <div className="h-3.5 w-24 bg-gray-200/60 rounded"></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-40 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 w-24 bg-gray-200/60 rounded-full"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-16 bg-gray-200/60 rounded"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-block h-8 w-20 bg-gray-200/60 rounded-lg"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white p-16 text-center rounded-xl border border-gray-100 shadow-sm text-gray-400 text-sm font-semibold">
          Tidak ada data pengguna yang cocok.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Nama & NIK</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Status Akun</th>
                  <th className="px-6 py-4">Role Akses</th>
                  <th className="px-6 py-4 text-right">Ubah Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[13px]">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-black">{u.nama}</span>
                        <span className="text-[11px] text-gray-400 font-medium">NIK: {u.nik}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-medium">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        u.isVerified 
                          ? 'bg-green-50 text-green-700' 
                          : 'bg-yellow-50 text-yellow-700'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${u.isVerified ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        {u.isVerified ? "Terverifikasi" : "Belum Verifikasi"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === 'ADMIN' ? 'bg-black text-white' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <select 
                        value={u.role} 
                        onChange={(e) => handleRoleChange(u.id, u.role, e.target.value)}
                        className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-700 focus:outline-none focus:border-black cursor-pointer shadow-sm hover:bg-gray-50"
                      >
                        <option value="WARGA">WARGA</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
