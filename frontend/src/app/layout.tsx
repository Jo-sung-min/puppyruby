import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PuppyRuby · 너와 나의 작은 행복",
  description: "작고 소중한 강아지와 함께하는 포근한 일상. 새로운 가족을 만나고, 돌보고, 나만의 모습으로 꾸며 보세요.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ko"><body>{children}</body></html>;
}
