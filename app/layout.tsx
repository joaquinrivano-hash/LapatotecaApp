import type { Metadata, Viewport } from "next";
import { Nunito, Baloo_2 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "La Patoteca — Hotel y guardería para perros",
  description:
    "Cuidamos a tu perro en una casa, sin jaulas ni caniles. Guardería de día, hotel, spa, paseos y traslados en Providencia, Santiago.",
  icons: {
    icon: [
      { url: "/marca/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/marca/icono-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/marca/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#fe5c82",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      className={`${nunito.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
