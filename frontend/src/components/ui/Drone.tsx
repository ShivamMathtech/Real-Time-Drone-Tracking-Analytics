import type { SVGProps } from "react";
export function Drone({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 9l18 14M25 9L7 23" />
      <ellipse cx="6" cy="8" rx="5" ry="2.5" />
      <ellipse cx="26" cy="8" rx="5" ry="2.5" />
      <ellipse cx="6" cy="24" rx="5" ry="2.5" />
      <ellipse cx="26" cy="24" rx="5" ry="2.5" />
      <rect x="12" y="12" width="8" height="8" rx="3" />
      <path d="M14 20v4m4-4v4" />
    </svg>
  );
}
