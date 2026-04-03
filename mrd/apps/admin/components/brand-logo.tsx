"use client";

import type { Project } from "@medplum/fhirtypes";

interface BrandLogoProps {
  project?: Project;
  size?: number;
  className?: string;
}

/**
 * Brand Logo Component
 * Displays the appropriate logo based on Project.setting
 * Falls back to MEDrecord logo if no brand setting is found
 */
export function BrandLogo({ project, size = 32, className }: BrandLogoProps) {
  const logoUrl = project?.setting?.find((s) => s.name === "brand.logoUrl")?.valueString;
  const brandName = project?.setting?.find((s) => s.name === "brand.name")?.valueString || "MEDrecord";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${brandName} logo`}
        width={size}
        height={size}
        className={className}
      />
    );
  }

  // Default MEDrecord logo (SVG inline for reliability)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={`${brandName} logo`}
    >
      {/* MEDrecord Logo - Stylized M with healthcare cross */}
      <rect width="32" height="32" rx="6" className="fill-primary" />
      <path
        d="M8 22V10L12 18L16 10L20 18L24 10V22"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16 6V10M14 8H18"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
