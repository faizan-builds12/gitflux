import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-muted text-muted-foreground',
      info: 'bg-[var(--info-soft)] text-[var(--info)]',
      pr: 'bg-[var(--pr-soft)] text-[var(--pr)]',
      ok: 'bg-[var(--ok-soft)] text-[var(--ok)]',
      warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
      danger: 'bg-[var(--danger-soft)] text-[var(--danger)]'
    }
  },
  defaultVariants: { variant: 'default' }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
