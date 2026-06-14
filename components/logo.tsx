import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: "sm" | "md" | "lg" | "xl";
}

export function Logo({ size = "md", className = "", ...props }: LogoProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-5 w-5",
    lg: "h-8 w-8",
    xl: "h-12 w-12",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizeClasses[size]} ${className}`}
      {...props}
    >
      <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" />
      <rect x="8" y="8" width="12" height="12" rx="2.5" fill="currentColor" fillOpacity="0.4" />
    </svg>
  );
}
