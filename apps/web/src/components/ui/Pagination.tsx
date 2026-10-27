import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '../../types/api';
import { Button } from './Button';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
      <p className="text-muted">
        Showing {from}–{to} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
          Prev
        </Button>
        <span className="text-muted">
          Page {meta.page} / {meta.totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
