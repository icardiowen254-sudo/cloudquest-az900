/** Original line illustration: a laptop showing a tick, with a cloud above it. */
export function Hero({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 190"
      role="img"
      aria-label="A laptop showing a tick, with a cloud above it"
      className={className}
      fill="none"
      stroke="#163300"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="120" cy="58" r="46" fill="#9fe870" stroke="none" />
      <path
        transform="translate(66 6) scale(4.5)"
        strokeWidth={0.56}
        fill="#ffffff"
        d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
      />
      <rect x="64" y="108" width="112" height="60" rx="6" fill="#ffffff" />
      <path d="M105 138l11 11 21-22" />
      <path d="M48 168h144l-10 14H58z" fill="#ffffff" />
      <path d="M196 38l9-9M202 58h12M188 22v-11M44 40l-9-9M40 60H27" />
    </svg>
  );
}
