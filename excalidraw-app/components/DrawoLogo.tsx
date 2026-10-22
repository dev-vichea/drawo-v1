import React from "react";

export interface DrawoLogoIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

/**
 * Drawo Brand Logo Icon (Hand-drawn diagonal pencil with cutout and underline).
 * Clean, lightweight vector SVG adapted for both light and dark modes.
 */
export const DrawoLogoIcon: React.FC<DrawoLogoIconProps> = ({
  size = 38,
  color = "currentColor",
  style,
  className = "",
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="200 170 880 890"
      width={size}
      height={size}
      role="img"
      aria-label="Drawo logo"
      className={`drawo-logo-icon ${className}`}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        color,
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {/* Pencil body with transparent cut-outs for body panel and tip */}
      <path
        fill={color}
        fillRule="evenodd"
        d="M225 950 L360 595 Q370 568 392 548 L680 265 C740 205 810 185 860 185 C990 185 1068 290 1068 410 C1068 470 1040 530 990 580 L700 865 Q680 890 640 900 L285 1002 Q240 1012 222 985 Q214 968 225 950 Z M470 615 L722 360 C762 315 802 293 852 293 C922 293 962 345 962 410 C962 452 945 490 910 522 L635 785 Z M415 688 L555 830 L430 868 Q395 878 376 856 Q360 836 370 800 Z"
      />

      {/* Slot on body */}
      <line
        x1="643"
        y1="607"
        x2="783"
        y2="465"
        stroke={color}
        strokeWidth="58"
        strokeLinecap="round"
      />

      {/* Underline stroke */}
      <rect
        x="585"
        y="958"
        width="393"
        height="86"
        rx="43"
        ry="43"
        fill={color}
      />
    </svg>
  );
};

export interface DrawoLogoProps {
  size?: number | string;
  withText?: boolean;
  textSize?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Drawo Brand Logo with icon and stylized typography.
 */
export const DrawoLogo: React.FC<DrawoLogoProps> = ({
  size = 42,
  withText = true,
  textSize = "42px",
  color = "var(--color-primary)",
  className = "",
  style,
}) => {
  return (
    <div
      className={`drawo-logo ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        userSelect: "none",
        ...style,
      }}
    >
      <DrawoLogoIcon size={size} color={color} />
      {withText && (
        <span
          style={{
            fontSize: textSize,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            color: "var(--color-on-surface, #1e293b)",
            lineHeight: 1,
          }}
        >
          drawo
        </span>
      )}
    </div>
  );
};

export default DrawoLogo;
