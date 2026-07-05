/** zaentrum wordmark lockup — blue chevron + mono wordmark + blinking cursor.
 *  Used as the katalog console's brand link back to the portal launchpad. */
export function ZaentrumLockup({ height = 26 }: { height?: number }) {
  const vbW = 170;
  const vbH = 40;
  const width = (height / vbH) * vbW;
  return (
    <svg height={height} width={width} viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label="zaentrum" style={{ display: 'block' }}>
      <path d="M6 9 L17 20 L6 31" fill="none" stroke="var(--cloud-blue)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x="28" y="28" fontFamily="var(--ff-mono, ui-monospace, monospace)" fontWeight={700} fontSize={22} fill="var(--fg-2, #C9D1D9)" letterSpacing="0.5">
        zaentrum
      </text>
      <rect x="151" y="11" width="9" height="19" fill="var(--cloud-blue)">
        <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1.05s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}
