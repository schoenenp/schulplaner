import "@/styles/globals.css";

import { type Metadata } from "next";
import localFont from "next/font/local";

import { TRPCReactProvider } from "@/trpc/react";
import { ToastProvider } from "@/app/_components/toast";

const baloo = localFont({
  src: "./fonts/Baloo_2/Baloo2-VariableFont_wght.ttf",
  variable: "--font-baloo",
  display: "swap",
  weight: "400 800",
});

const cairo = localFont({
  src: "./fonts/Cairo/Cairo-VariableFont_slnt,wght.ttf",
  variable: "--font-cairo",
  display: "swap",
  weight: "200 1000",
});

export const metadata: Metadata = {
  title: "PIRROT | BPANEL",
  description: "pirrot config panel",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baloo.variable} ${cairo.variable}`}>
      <body className="font-sans">
        <TRPCReactProvider>
          <ToastProvider>
            <div id="modal-hook"></div>
            {children}
          </ToastProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
