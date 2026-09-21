"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Mail, PawPrint, Phone } from "lucide-react";

const HIDDEN_PATHS = ["/admin", "/play"];

export function PuppyRubyFooter() {
  const pathname = usePathname();
  const hidden = HIDDEN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));

  if (hidden) return null;

  return (
    <footer className="puppyruby-site-footer">
      <div className="puppyruby-footer-inner">
        <div className="puppyruby-footer-top">
          <div className="puppyruby-footer-brand">
            <Link href="/" aria-label="퍼피루비 홈">
              <span className="puppyruby-footer-logo"><PawPrint size={24} aria-hidden="true" /></span>
              <span><b>PuppyRuby</b><small>퍼피루비</small></span>
            </Link>
            <p>작은 강아지와 함께하는 하루.<br />화면 위에서 언제나 곁에 있어요.</p>
          </div>

          <nav className="puppyruby-footer-links" aria-label="푸터 메뉴">
            <div>
              <small>PUPPYRUBY</small>
              <Link href="/">홈</Link>
              <Link href="/play">강아지 만나기</Link>
            </div>
            <div>
              <small>SERVICE</small>
              <Link href="/shop">아이템 상점</Link>
              <Link href="/account">내 계정</Link>
              <a href="/api/desktop/download"><Download size={13} aria-hidden="true" /> Windows 다운로드</a>
            </div>
            <div>
              <small>CONTACT</small>
              <a href="tel:07080272561"><Phone size={13} aria-hidden="true" /> 070-8027-2561</a>
              <a href="mailto:contact@lucelab.co.kr"><Mail size={13} aria-hidden="true" /> contact@lucelab.co.kr</a>
            </div>
          </nav>
        </div>

        <div className="puppyruby-footer-business" aria-label="사업자 정보">
          <span><b>상호명</b> 루체</span>
          <span><b>대표자</b> 조성민</span>
          <span><b>사업자등록번호</b> 715-01-03479</span>
          <span><b>통신판매업신고번호</b> 2025-고양덕양구-1028</span>
          <span className="wide"><b>사업장 주소</b> 서울 강남구 학동로24길 20 (논현동, 참존빌딩) 402호</span>
        </div>

        <div className="puppyruby-footer-bottom">
          <p>퍼피루비는 화면 위 작은 강아지와 함께하는 디지털 반려 경험을 제공합니다.</p>
          <small>© 2026 LUCE. PUPPYRUBY. ALL RIGHTS RESERVED.</small>
        </div>
      </div>
    </footer>
  );
}
