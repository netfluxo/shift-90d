import type { Metadata, Viewport } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shift 90D",
  description: "App de atividade fisica - Transforme seu corpo em 90 dias",
  manifest: "/manifest.json",
  icons: {
    icon: "/fav.png",
    apple: "/fav.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1E5A8A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body className={`${inter.className} antialiased bg-linear-to-br from-primary-dark via-primary to-secondary-dark bg-fixed`}>
        <main className="max-w-lg mx-auto min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
