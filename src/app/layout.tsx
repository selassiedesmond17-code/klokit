import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeToggle from "@/components/theme-toggle";
import NavigationFeedback from "@/components/navigation-feedback";
import AppNav from "@/components/app-nav";
import BackBar from "@/components/back-bar";
import PwaRegister from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "KlokIt", template: "%s · KlokIt" },
  description: "KlokIt: attendance clocking for organizations",
  applicationName: "KlokIt",
  appleWebApp: { capable: true, title: "KlokIt", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e0e5ec" },
    { media: "(prefers-color-scheme: dark)", color: "#2b2f36" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);if(localStorage.getItem("installHidden")==="1"){document.documentElement.setAttribute("data-install-hidden","1");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeToggle />
        <NavigationFeedback />
        <AppNav />
        <BackBar />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}