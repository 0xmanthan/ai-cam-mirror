type P = { size?: number };

function Svg({ size = 18, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15 10.5 20 7v10l-5-3.5" />
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
  </Svg>
);
export const CameraOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15 10.5 20 7v10l-5-3.5" />
    <path d="M10.5 6H13a2 2 0 0 1 2 2v2.5M15 15v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2" />
    <path d="m2 2 20 20" />
  </Svg>
);
export const FlipIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 9a8 8 0 0 1 14.5-3.5L20 7" />
    <path d="M20 3v4h-4" />
    <path d="M20 15a8 8 0 0 1-14.5 3.5L4 17" />
    <path d="M4 21v-4h4" />
  </Svg>
);
export const ScreenIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
);
export const KeyIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
  </Svg>
);
export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);
export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12 5 5L20 7" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const ArrowUpIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const ArrowDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const AskIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
    <path d="M11 8v6M8 11h6" />
  </Svg>
);
export const LinkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Svg>
);
