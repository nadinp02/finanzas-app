import { cn } from "cn";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-end justify-between gap-4 pt-6 pb-5 lg:pt-10", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="truncate text-[28px] leading-tight font-bold lg:text-[32px]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card", className)}>{children}</div>;
}
