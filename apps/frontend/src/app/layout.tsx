import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar"; 

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "SIPMAS - Portal Pengaduan",
  description: "Portal pengaduan masyarakat terintegrasi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      {/* Hapus pt-16 di sini agar Admin tidak ikut melorot ke bawah */}
      <body className={inter.className}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}