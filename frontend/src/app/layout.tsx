import type { Metadata } from "next";
import { SessionBridge } from "@/components/session-bridge";
import { ThemeProvider } from "@/components/theme-provider";
import { DogAppearanceProvider } from "@/components/dog-appearance-provider";
import "galmuri/dist/galmuri.css";
import "./globals.css";
import "./landing.css";
import "./commands.css";
import "./walk.css";
import "./desktop-link.css";
import "./account.css";
import "./account-menu.css";
import "./admin-dog-styles.css";
import "./theme.css";
import "./commerce.css";
import "./cosmetics.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "PuppyRuby · 너의 하루에 작은 멍! 하나",
  description: "평범한 화면 속, 특별한 내 강아지. 시바견부터 사모예드까지, 픽셀 강아지를 만나고 쓰다듬고 함께 놀아요. 설치 없이 시작하는 작은 행복.",
  icons: { icon: "/favicon.svg" },
  referrer: "no-referrer",
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ko" suppressHydrationWarning><head><script id="puppyruby-theme" dangerouslySetInnerHTML={{ __html: `try{var p=localStorage.getItem('puppyruby-theme');document.documentElement.dataset.theme=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` }} /></head><body><ThemeProvider><DogAppearanceProvider><SessionBridge />{children}</DogAppearanceProvider></ThemeProvider></body></html>;
}
