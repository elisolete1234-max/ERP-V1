import Image from "next/image";
import { BRAND_LOGO_PATH, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  nameClassName?: string;
  subtitleClassName?: string;
  showName?: boolean;
  showSubtitle?: boolean;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
};

const logoSizes = {
  sm: { width: 168, height: 64 },
  md: { width: 220, height: 84 },
  lg: { width: 288, height: 110 },
} as const;

export function BrandLogo({
  className,
  imageClassName,
  nameClassName,
  subtitleClassName,
  showName = false,
  showSubtitle = false,
  priority = false,
  size = "md",
}: BrandLogoProps) {
  const dimensions = logoSizes[size];

  return (
    <div className={className}>
      <Image
        src={BRAND_LOGO_PATH}
        alt={BRAND_NAME}
        width={dimensions.width}
        height={dimensions.height}
        priority={priority}
        className={imageClassName}
        style={{ width: "auto", height: "auto" }}
      />
      {showName || showSubtitle ? (
        <div>
          {showName ? <div className={nameClassName}>{BRAND_NAME}</div> : null}
          {showSubtitle ? <div className={subtitleClassName}>{BRAND_TAGLINE}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
