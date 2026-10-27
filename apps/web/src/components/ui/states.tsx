import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sage-100/80', className)} aria-hidden />;
}

/** Placeholder rows while a table loads. */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-5" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-sage-100 p-3 text-sage-700">{icon ?? <Inbox className="h-5 w-5" aria-hidden />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-clay-50 p-3 text-clay-600">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders the right state for a query: loading, error, empty or content. */
export function QueryBoundary({
  isLoading,
  error,
  onRetry,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <>{skeleton ?? <TableSkeleton />}</>;
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Request failed'} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
