import "@/styles/globals.css";

import { type Metadata } from "next";
import localFont from "next/font/local";

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

import { PostHogClientProvider } from "@/app/_components/posthog-provider";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Schulplaner | Digitaldruck Pirrot",
  description: "Schulplaner mit eigenen Terminen und Umschlag gestalten und direkt bei Digitaldruck Pirrot bestellen.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${baloo.variable} ${cairo.variable}`}>
      <body>
        <PostHogClientProvider>
          <TRPCReactProvider>
            <div id="modal-hook"></div>
            {children}
          </TRPCReactProvider>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
