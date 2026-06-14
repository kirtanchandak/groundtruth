import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const sizePixels = {
    sm: 16,
    md: 20,
    lg: 32,
    xl: 48,
  };

  return (
    <Image
      src="/groundtruth_icon.png"
      alt="GroundTruth"
      width={sizePixels[size]}
      height={sizePixels[size]}
      className={`shrink-0 rounded-md ${className}`}
      priority={false}
    />
  );
}
