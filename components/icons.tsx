import { useId, type JSX, type SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };
export type Icon = (props: IconProps) => JSX.Element;

type Layer = { fill?: string | string[]; bar?: string };
type Point = [x: number, y: number, radius?: number];

const BAR = 2.75;
const GAP = 2;

const n = (v: number) => +v.toFixed(2);

const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${cy}A${r} ${r} 0 1 0 ${n(cx + r)} ${cy}A${r} ${r} 0 1 0 ${n(cx - r)} ${cy}Z`;

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${y}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${r} ${r} 0 0 1 ${x} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${y}Z`;

function poly(points: Point[], r: number) {
  const toward = ([x, y]: Point, [tx, ty]: Point, cut: number) => {
    const length = Math.hypot(tx - x, ty - y);
    const t = Math.min(cut, length / 2) / length;
    return `${n(x + (tx - x) * t)} ${n(y + (ty - y) * t)}`;
  };
  return (
    points
      .map((p, i) => {
        const cut = p[2] ?? r;
        const prev = points[(i + points.length - 1) % points.length];
        const next = points[(i + 1) % points.length];
        return `${i ? "L" : "M"}${toward(p, prev, cut)}Q${n(p[0])} ${n(p[1])} ${toward(p, next, cut)}`;
      })
      .join("") + "Z"
  );
}

const polar = (cx: number, cy: number, r: number, deg: number): Point => [
  cx + r * Math.cos((deg * Math.PI) / 180),
  cy + r * Math.sin((deg * Math.PI) / 180),
];

const radial = (cx: number, cy: number, count: number, profile: [r: number, deg: number][]) =>
  Array.from({ length: count }, (_, k) => profile.map(([r, deg]) => polar(cx, cy, r, -90 + (k * 360) / count + deg))).flat();

function Shapes({ fill, bar, grow = 0 }: Layer & { grow?: number }) {
  return (
    <>
      {[fill ?? []].flat().map((d) => (
        <path key={d} d={d} fillRule="evenodd" stroke={grow ? "currentColor" : undefined} strokeWidth={grow || undefined} strokeLinejoin="round" />
      ))}
      {bar && <path d={bar} fill="none" stroke="currentColor" strokeWidth={BAR + grow} strokeLinecap="round" strokeLinejoin="round" />}
    </>
  );
}

/**
 * Two tones from one colour: the back layer is the same currentColor at --icon-duo opacity, so every
 * state recolours through CSS. `cut` knocks a GAP-wide moat out of the back around the front, for
 * fronts that sit inside their back shape.
 */
function duo(back: Layer, front: Layer, cut = false): Icon {
  return function DuoIcon({ size = 24, ...props }) {
    const id = useId();
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden focusable="false" {...props}>
        {cut && (
          <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="#fff" />
            <g color="#000" fill="#000">
              <Shapes {...front} grow={GAP * 2} />
            </g>
          </mask>
        )}
        <g style={{ opacity: "var(--icon-duo, 0.62)" }} mask={cut ? `url(#${id})` : undefined}>
          <Shapes {...back} />
        </g>
        <Shapes {...front} />
      </svg>
    );
  };
}

function mono(bar: string): Icon {
  return function MonoIcon({ size = 24, ...props }) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden focusable="false" {...props}>
        <Shapes bar={bar} />
      </svg>
    );
  };
}

const corners = "M3.5 8.5v-2a3 3 0 0 1 3-3h2M15.5 3.5h2a3 3 0 0 1 3 3v2M20.5 15.5v2a3 3 0 0 1-3 3h-2M8.5 20.5h-2a3 3 0 0 1-3-3v-2";
const disc = circle(12, 12, 9.25);
// 3.52 is where the coin's side (x 3.5) meets the GAP-outset ellipse of the shape above it.
const coinBand = (above: number, cy: number) =>
  `M3.5 ${n(above + 3.52)}V${cy}A8.5 4 0 0 0 20.5 ${cy}V${n(above + 3.52)}A10.5 6 0 0 1 3.5 ${n(above + 3.52)}Z`;

export const HomeIcon = duo(
  { fill: poly([[3, 10], [12, 3], [21, 10]], 1.75) },
  {
    fill: "M8 12H16A2.5 2.5 0 0 1 18.5 14.5V18A2.5 2.5 0 0 1 16 20.5H14.75A.75.75 0 0 1 14 19.75V17.5A2 2 0 0 0 10 17.5V19.75A.75.75 0 0 1 9.25 20.5H8A2.5 2.5 0 0 1 5.5 18V14.5A2.5 2.5 0 0 1 8 12Z",
  },
);

export const ClockIcon = duo({ fill: disc }, { bar: "M12 7.5V12l3 2" }, true);

export const GearIcon = duo(
  { fill: circle(12, 12, 2.5) },
  { fill: poly(radial(12, 12, 6, [[7, -21], [9.5, -12], [9.5, 12], [7, 21]]), 1.25) + circle(12, 12, 4.5) },
);

export const PlusIcon = mono("M12 5v14M5 12h14");
export const CloseIcon = mono("M6.5 6.5l11 11m0-11-11 11");
export const BackIcon = mono("M15 5l-7 7 7 7");
export const ChevronRightIcon = mono("M9 5l7 7-7 7");
export const ChevronDownIcon = mono("M5 9l7 7 7-7");
export const CheckIcon = mono("M5 12.5l4.5 4.5L19 7");
export const TrendUpIcon = mono("M7 17 17 7M9.5 7H17v7.5");

export const ReceiveIcon = duo({ bar: "M5 20h14" }, { bar: "M12 3.5v11M7 10l5 5 5-5" });

export const SendIcon = duo(
  { fill: circle(13, 11, 8) },
  { fill: poly([[12, 12], [9, 21], [7, 17, 1], [3, 15]], 1.25) },
  true,
);

export const SwapIcon = duo({ bar: "M20 16.5H4.5m4-3.75-3.75 3.75 3.75 3.75" }, { bar: "M4 7.5h15.5m-4-3.75 3.75 3.75-3.75 3.75" });

export const FlipIcon = duo({ bar: "M16.5 20V4.5m3.75 4-3.75-3.75-3.75 3.75" }, { bar: "M7.5 4v15.5m-3.75-4 3.75 3.75 3.75-3.75" });

export const ApproxIcon = duo({ bar: "M5 9c2.33-2 4.67-2 7 0s4.67 2 7 0" }, { bar: "M5 15c2.33-2 4.67-2 7 0s4.67 2 7 0" });

export const BankIcon = duo(
  { fill: rr(4.5, 12.5, 3.5, 8, 1.5) + rr(10.25, 12.5, 3.5, 8, 1.5) + rr(16, 12.5, 3.5, 8, 1.5) },
  { fill: poly([[3, 10.5], [12, 3.5], [21, 10.5]], 1.75) },
);

export const CardIcon = duo(
  { fill: poly([[3, 5, 3.5], [21, 5, 3.5], [21, 8.5, 1], [3, 8.5, 1]], 1) },
  { fill: poly([[3, 10.5, 1], [21, 10.5, 1], [21, 19, 3.5], [3, 19, 3.5]], 1) },
);

export const WalletIcon = duo(
  { fill: poly([[5, 7.5], [15, 3.5], [16.5, 7.5]], 1.25) },
  { fill: rr(3, 9.5, 18, 11.5, 3.5) + circle(16.25, 15.25, 1.5) },
);

export const CoinIcon = duo(
  { fill: disc },
  { bar: "M14.5 9.75c-.4-.9-1.3-1.5-2.5-1.5-1.4 0-2.5.75-2.5 1.75 0 2.5 5 1.25 5 4 0 1-1.1 1.75-2.5 1.75-1.2 0-2.2-.6-2.6-1.5M12 7v1.25M12 15.75V17" },
  true,
);

export const CoinsIcon = duo(
  { fill: "M3.5 7A8.5 4 0 1 0 20.5 7A8.5 4 0 1 0 3.5 7Z" },
  { fill: coinBand(7, 12) + coinBand(12, 17) },
);

export const ReceiptIcon = duo(
  { bar: "M4 4.5h16" },
  {
    fill:
      poly([[6, 8, 1.5], [18, 8, 1.5], [18, 21], [16, 19.25], [14, 21], [12, 19.25], [10, 21], [8, 19.25], [6, 21]], 0.6) +
      rr(8.75, 10.75, 6.5, 2.5, 1.25) +
      rr(8.75, 14.75, 4, 2.5, 1.25),
  },
);

export const SparkleIcon = duo(
  {
    fill: [18, 90, 162, 234, 306]
      .map((a) => poly([polar(12, 11, 6, a), polar(12, 11, 9.75, a - 11), polar(12, 11, 9.75, a + 11)], 0.75))
      .join(""),
  },
  { fill: poly(radial(12, 11, 5, [[6.75, 0], [3.75, 36]]), 1.25) },
);

export const LightningIcon = duo(
  { fill: poly([[9.5, 2.5], [17, 2.5], [13.5, 10.5], [5, 10.5]], 1.25) },
  { fill: poly([[9, 12.5], [19, 12.5], [8.5, 21.5]], 1.25) },
);

export const PercentIcon = duo({ fill: circle(7.25, 7.25, 3.25) + circle(16.75, 16.75, 3.25) }, { bar: "M5.5 18.5 18.5 5.5" });

export const ChartIcon = duo(
  { fill: rr(3, 13, 4.5, 7.5, 1.75) + rr(9.75, 9, 4.5, 11.5, 1.75) },
  { fill: rr(16.5, 4, 4.5, 16.5, 1.75) },
);

export const PayoutIcon = duo({ fill: circle(9.5, 14.5, 6.5) }, { bar: "M12.5 11.5 19.5 4.5M13.5 4.5h6v6" }, true);

export const FaceIdIcon = duo({ bar: corners }, { bar: "M9 9v1.5M15 9v1.5M9 15c1.7 1.4 4.3 1.4 6 0" });

export const PhoneIcon = duo({ fill: rr(5.75, 2, 12.5, 20, 3.5) }, { fill: rr(8.25, 4.5, 7.5, 15, 1.25) });

export const LockIcon = duo({ bar: "M8 12V7.5a4 4 0 0 1 8 0V12" }, { fill: rr(4, 10.5, 16, 11, 3.5) + rr(10.75, 13.75, 2.5, 4.5, 1.25) }, true);

export const CloudIcon = duo({ fill: circle(9.5, 10.5, 5.5) }, { fill: [rr(3, 12, 18, 8.5, 4.25), circle(15.5, 12, 4.5)] }, true);

export const KeyIcon = duo({ bar: "M14.75 9.25 20.25 3.75M17.5 6.5 20 9" }, { fill: circle(8.5, 15.5, 5.5) + circle(8.5, 15.5, 2) });

export const ShieldIcon = duo(
  { fill: poly([[11, 3, 0.75], [4.5, 3, 2.5], [4.5, 11.5, 5.5], [11, 21, 1.5]], 1) },
  { fill: poly([[13, 3, 0.75], [19.5, 3, 2.5], [19.5, 11.5, 5.5], [13, 21, 1.5]], 1) },
);

export const IdCardIcon = duo({ fill: rr(2.5, 5, 19, 14, 4) }, { fill: circle(8.5, 12, 2.5), bar: "M14 10.25h3.5M14 13.75h2" }, true);

export const BellIcon = duo(
  { bar: "M10.25 20.25h3.5" },
  {
    fill: "M12 3c-3.6 0-6.5 2.9-6.5 6.5v2.3c0 .6-.2 1.2-.6 1.7l-1 1.3c-.7.9-.1 2.2 1.1 2.2h14c1.2 0 1.8-1.3 1.1-2.2l-1-1.3c-.4-.5-.6-1.1-.6-1.7V9.5C18.5 5.9 15.6 3 12 3Z",
  },
);

export const HelpIcon = duo(
  { fill: disc },
  { fill: circle(12, 16.5, 1.4), bar: "M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.6.3-1.1.9-1.1 1.6v.15" },
  true,
);

export const SignOutIcon = duo(
  { bar: "M10 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h3" },
  { bar: "M9.5 12h11M16.5 8l4 4-4 4" },
);

export const CheckCircleIcon = duo({ fill: disc }, { bar: "M8 12.25 10.75 15 16 9.5" }, true);

export const WarningIcon = duo({ fill: disc }, { fill: circle(12, 16.5, 1.5), bar: "M12 7v5.5" }, true);

export const VerifiedIcon = duo(
  { fill: poly(radial(12, 12, 8, [[9.75, 0], [7.75, 22.5]]), 1.75) },
  { bar: "M8.25 12.25 10.75 14.75 15.75 9.5" },
  true,
);

export const CopyIcon = duo({ fill: rr(3, 3, 12, 12, 4) }, { fill: rr(9, 9, 12, 12, 4) }, true);

export const ShareIcon = duo({ bar: "M5 11.5v6A3 3 0 0 0 8 20.5h8a3 3 0 0 0 3-3v-6" }, { bar: "M12 3.5V14M8.5 7 12 3.5 15.5 7" });

export const PasteIcon = duo({ fill: rr(4.5, 4.5, 15, 16.5, 4) }, { fill: rr(8.5, 2.5, 7, 4.5, 2.25) }, true);

export const ScanIcon = duo(
  { bar: corners },
  { fill: rr(7, 7, 4.25, 4.25, 1.25) + rr(12.75, 7, 4.25, 4.25, 1.25) + rr(7, 12.75, 4.25, 4.25, 1.25) + rr(13.25, 13.25, 3.25, 3.25, 1) },
);

export const GridIcon = duo(
  { fill: circle(17.25, 6.75, 3.75) + circle(6.75, 17.25, 3.75) },
  { fill: circle(6.75, 6.75, 3.75) + circle(17.25, 17.25, 3.75) },
);

export const ImagesIcon = duo(
  { fill: rr(3, 3.5, 18, 17, 4.5) },
  { fill: poly([[6.5, 17], [10.5, 11.5], [13.5, 15], [15.5, 13], [18, 17]], 1) + circle(15.5, 8.5, 1.75) },
  true,
);

export const RestoreIcon = duo(
  { bar: "M5.66 10.69A6.75 6.75 0 1 0 15.87 7.47" },
  { fill: poly([[8, 6.25], [12.5, 3.25], [12.5, 9.25]], 1.25) },
);
