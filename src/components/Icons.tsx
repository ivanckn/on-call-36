// One outline icon set, stroke 1.5, currentColor. Drawn by hand for this prototype.
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...props,
});

export const IconPlane = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 13.5l7.5-1.5 4-7.5a1.5 1.5 0 0 1 2.8 1.1L15.5 12l5.5 2.5v2l-7-1.5-3.5 4.5H8.5l1.5-5.5L3 15.5z" /></svg>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconBox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9" /></svg>
);
export const IconThermo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M10 4.5a2 2 0 0 1 4 0v9a3.5 3.5 0 1 1-4 0z" /><path d="M12 9v6" /></svg>
);
export const IconWarn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3.5l9 16H3z" /><path d="M12 9.5v4.5M12 17.5v.01" /></svg>
);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></svg>
);
export const IconScale = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4v16M5 20h14M4 8h16" /><path d="M7 8l-3 6h6zM17 8l-3 6h6z" /></svg>
);
export const IconPerson = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
);
export const IconRoute = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="6" r="2.5" /><path d="M7.5 18H14a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8" transform="translate(0 4) scale(1 0.75)" /></svg>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="5" width="17" height="15" rx="1" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3.5 12.5v-8a1 1 0 0 1 1-1h8l8 8-9 9z" /><path d="M7.5 7.5h.01" /></svg>
);
export const IconBuilding = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20V5.5L12 3l8 2.5V20M4 20h16M9 20v-4h6v4" /><path d="M8 9h2M14 9h2M8 13h2M14 13h2" /></svg>
);
export const IconArrow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 12h16M14 6l6 6-6 6" /></svg>
);
export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
);
export const IconLayers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" /><path d="M3.5 12L12 16.5l8.5-4.5M3.5 16L12 20.5l8.5-4.5" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
);
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" /></svg>
);
export const IconPhone = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17.5h2" /></svg>
);
export const IconCherry = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="8" cy="16.5" r="3.5" /><circle cx="16" cy="17" r="3.5" /><path d="M8 13c1-4 3.5-7.5 7.5-9M16 13.5c0-4-.5-7-.5-9.5M15.5 4.5c1.5-.5 3 0 4 1" /></svg>
);
export const IconCoins = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.5l2.7 2.7L16.5 9.5" /></svg>
);
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconCompare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const IconCloud = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.2 8.6 4.7 4.7 0 0 1 17 18Z" /><path d="m11 13-1.5 3h3L11 19" /></svg>
);
