export function BreedPagination({ page, total, onChange, label = "견종 페이지" }: {
  page: number; total: number; onChange: (page: number) => void; label?: string;
}) {
  if (total <= 1) return null;
  return <nav className="breed-pagination" aria-label={label}>
    <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>이전</button>
    {Array.from({ length: total }, (_, index) => index + 1).map(number => <button type="button" key={number} aria-label={`${number}페이지`} aria-current={page === number ? "page" : undefined} onClick={() => onChange(number)}>{number}</button>)}
    <button type="button" disabled={page === total} onClick={() => onChange(page + 1)}>다음</button>
    <span aria-live="polite">{page} / {total} 페이지 · 한 페이지에 12종</span>
  </nav>;
}
