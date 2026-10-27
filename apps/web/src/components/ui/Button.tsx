import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-sage-700 text-white hover:bg-sage-800 disabled:bg-sage-300',
  secondary: 'border border-line-strong bg-white text-ink hover:bg-sage-50 disabled:text-muted',
  ghost: 'text-ink-soft hover:bg-sage-100 disabled:text-muted',
  danger: 'bg-clay-600 text-white hover:bg-clay-700 disabled:bg-clay-100',
};
const sizes: Record<Size, string> = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
