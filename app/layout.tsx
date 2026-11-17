import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { AppChrome } from "./app-chrome";
import "./globals.css";
import "./workspace-shell.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-serif", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "INEPAD Reembolso",
  description: "Crie relatórios, organize comprovantes e acompanhe a aprovação dos reembolsos.",
  icons: {
    icon: [{ url: "/inepad-reembolso/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/inepad-reembolso/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${manrope.variable} ${playfair.variable}`}><AppChrome>{children}</AppChrome></body></html>;
}
