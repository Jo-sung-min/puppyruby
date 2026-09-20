import type { Metadata } from "next";
import { getServerSeo, rootSeoMetadata } from "@/lib/server-seo";
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
import "./admin-seo.css";
import "./admin-desktop-release.css";
import "./breed-catalog.css";
import "./theme.css";
import "./commerce.css";
import "./cosmetics.css";
import "./checkout.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { return rootSeoMetadata(await getServerSeo()); }
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ko" suppressHydrationWarning><head><script id="puppyruby-theme" dangerouslySetInnerHTML={{ __html: `try{var p=localStorage.getItem('puppyruby-theme');document.documentElement.dataset.theme=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` }} /></head><body><ThemeProvider><DogAppearanceProvider><SessionBridge />{children}</DogAppearanceProvider></ThemeProvider></body></html>;
}
