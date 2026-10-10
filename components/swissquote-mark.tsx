import type { SVGProps } from "react";

/** Swissquote's mark, as swissquote.com draws it. Its orange and proportions are the brand's; don't recolour it. */
export function SwissquoteMark({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 35 35" width={size} height={size} fill="none" aria-hidden focusable="false" {...props}>
      <path
        fill="#FA5B35"
        d="M17.5 0A17.5 17.5 0 1 1 0 17.5 17.396 17.396 0 0 1 17.5 0ZM8.694 10.124v3.048h17.613v-3.048H8.694Zm3.048 11.365c0-.94.226-1.505.602-1.881a2.183 2.183 0 0 1 3.011 0c.377.376.602.94.602 1.881v3.387h3.086V21.49c0-.94.226-1.505.602-1.881a2.182 2.182 0 0 1 3.011 0c.377.376.602.94.602 1.881v3.387h3.049v-8.919H8.694v8.92h3.048v-3.388Z"
      />
    </svg>
  );
}
