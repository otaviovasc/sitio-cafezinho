import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const CowHead = forwardRef<SVGSVGElement, LucideProps>(function CowHead({ size = 24, strokeWidth = 2, ...props }, ref) {
  return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 5 4 3v4l2 2" />
    <path d="m17 5 3-2v4l-2 2" />
    <path d="M7 5c1.2-1 2.8-1.5 5-1.5S15.8 4 17 5l1 6c.5 3.5-1.6 7-6 7s-6.5-3.5-6-7l1-6Z" />
    <path d="M8.5 10h.01M15.5 10h.01" />
    <path d="M8.5 15c1.8-1.3 5.2-1.3 7 0" />
    <path d="M10 14v2M14 14v2" />
  </svg>;
});
