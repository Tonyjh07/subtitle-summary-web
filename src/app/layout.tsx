import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { PreferenceHydrator } from "@/components/layout/preference-hydrator";
import { SiteHeader } from "@/components/layout/site-header";
import { RegisterSw } from "@/components/pwa/register-sw";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "视频转文字 — 链接一键生成文字稿与 AI 总结",
    template: "%s · 视频转文字",
  },
  description:
    "粘贴 B站视频链接，自动获取字幕生成带时间戳的文字稿与 AI 总结，支持导出 TXT / Markdown。",
  appleWebApp: {
    capable: true,
    title: "视频转文字",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        {/* 全局层：本地偏好水合 */}
        <PreferenceHydrator />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <RegisterSw />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
