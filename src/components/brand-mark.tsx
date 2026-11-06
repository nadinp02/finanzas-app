import { cn } from "cn";
import { BRAND_GREEN, BRAND_INK } from "@/lib/app";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={cn("size-9", className)}>
      <rect width="512" height="512" rx="128" fill={BRAND_INK} />
      <path
        d="M341 171a120 120 0 1 0 0 170"
        fill="none"
        stroke="#f6f5f1"
        strokeWidth="56"
        strokeLinecap="round"
      />
      <circle cx="356" cy="256" r="30" fill={BRAND_GREEN} />
    </svg>
  );
}
