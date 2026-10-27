import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Label + control + hint/error wiring (htmlFor, aria-invalid, aria-describedby). */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
        {required && <span className="ml-0.5 text-clay-600" aria-hidden>*</span>}
      </label>
      {children({ id, describedBy: error || hint ? msgId : undefined, invalid: Boolean(error) })}
      {(error || hint) && (
        <p id={msgId} role={error ? 'alert' : undefined} className={cn('mt-1 text-xs', error ? 'text-clay-700' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, wrapperClassName, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          ref={ref}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn('input', invalid && 'input-error', className)}
          {...rest}
        />
      )}
    </Field>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, wrapperClassName, className, required, children, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          ref={ref}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn('input pr-8', invalid && 'input-error', className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
});

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, error, hint, wrapperClassName, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          ref={ref}
          rows={3}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn('input', invalid && 'input-error', className)}
          {...rest}
        />
      )}
    </Field>
  );
});
