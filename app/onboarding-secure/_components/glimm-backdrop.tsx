import {
  accentChain,
  createShader,
  playSweep,
  type Palette,
  type ShaderController,
  type SweepHandle,
  type SweepOptions,
} from "glimm";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef } from "react";
import { reveal } from "@/app/(tabs)/_components/transitions";
import type { Tone } from "../data";

// The shader drifts hue over time. With two close anchors the cosine fit stays between them
// wherever the drift lands, so each tone keeps reading as itself.
const PALETTES: Record<Tone, Palette> = {
  blue: accentChain(["#14dcfb", "#0cbcf9"]),
  orange: accentChain(["#f5ab05", "#f2701c"]),
  violet: accentChain(["#7400f5", "#8e20f6"]),
  white: accentChain(["#ffffff"]),
};

// The resting band is parked just under the top edge and falls off into the white page.
// Its alpha times the shader's edge fade stays at 1: any higher and the crest clips into a visible ridge.
const REST = { progress: 0.2, bandTight: 6, alpha: 1.4 };

// First paint: a wide band rises from the bottom until the screen is flooded, then clears upward.
const ENTRY: SweepOptions = {
  palette: accentChain(["#16dcfb", "#0a62f0"]),
  direction: "btt",
  bandTight: 1.1,
  sweepMs: 1500,
  outroMs: 400,
  midpoint: 0.45,
  peakAlpha: 1,
  easing: "easeInOutCubic",
  swellAmount: 0.3,
};

// How long the resting band takes to clear when the tone changes, in seconds.
const DIP = 0.18;

// Step changes: once the resting band has dipped out, a band of the next colour runs down as it returns in that colour.
const CHANGE: SweepOptions = {
  direction: "ttb",
  bandTight: 24,
  sweepMs: 900,
  outroMs: 260,
  midpoint: 0.12,
  peakAlpha: 0.55,
  easing: "easeOutCubic",
  swellAmount: 0.45,
};

type Rest = {
  shader: ShaderController;
  /** The step's palette, waiting for the band to be out of sight. */
  next?: Palette;
  alpha?: AnimationPlaybackControls;
};

export function GlimmBackdrop({ tone }: { tone: Tone }) {
  const restCanvas = useRef<HTMLCanvasElement>(null);
  const sweepCanvas = useRef<HTMLCanvasElement>(null);
  const shaders = useRef<{ rest: Rest; sweep: ShaderController } | null>(null);
  // The resting band stays hidden until the entry flood has revealed it.
  const revealed = useRef(false);
  const reduceMotion = useReducedMotion();

  const restAlpha = tone !== "white" ? REST.alpha : 0;
  const targetAlpha = useRef(restAlpha);

  // Any blend between distant tones crosses brown-grey or a rainbow, so the band never shows one: a pending
  // palette dips it out, swaps while it is invisible, then fades it back. Visibility changes route through here too.
  const fadeRest = () => {
    const rest = shaders.current?.rest;
    if (!rest) return;
    rest.alpha?.stop();
    const from = rest.shader.getAlpha();
    const onUpdate = (a: number) => rest.shader.setAlpha(a);
    if (rest.next && from > 0 && !reduceMotion) {
      rest.alpha = animate(from, 0, { duration: DIP, ease: "easeInOut", onUpdate, onComplete: fadeRest });
      return;
    }
    if (rest.next) rest.shader.setPalette(rest.next);
    rest.next = undefined;
    const to = targetAlpha.current;
    rest.alpha = animate(from, to, { duration: to > 0 ? 0.6 : 0.35, ease: reveal.ease, onUpdate });
  };

  useEffect(() => {
    if (!restCanvas.current || !sweepCanvas.current) return;
    const shader = createShader({
      canvas: restCanvas.current,
      palette: PALETTES.blue,
      direction: "ttb",
      bandTight: REST.bandTight,
      swellAmount: 0,
    });
    const sweep = createShader({ canvas: sweepCanvas.current });
    if (!shader || !sweep) {
      shader?.destroy();
      sweep?.destroy();
      return;
    }
    shader.setProgress(REST.progress);
    const rest: Rest = { shader };
    shaders.current = { rest, sweep };
    revealed.current = false;
    return () => {
      rest.alpha?.stop();
      shader.destroy();
      sweep.destroy();
      shaders.current = null;
    };
  }, []);

  useEffect(() => {
    targetAlpha.current = restAlpha;
    if (revealed.current) fadeRest();
  }, [restAlpha]);

  useEffect(() => {
    const current = shaders.current;
    if (!current) return;
    const settle = () => {
      current.rest.next = PALETTES[tone];
      revealed.current = true;
      fadeRest();
    };
    if (reduceMotion) {
      settle();
      return;
    }
    const entry = tone === "blue";
    // The old band has to be gone before the sweep reaches it: one colour crossing another composites to grey.
    if (!entry) settle();
    let sweep: SweepHandle | undefined;
    const id = setTimeout(
      () => (sweep = playSweep(current.sweep, { palette: PALETTES[tone], ...(entry ? ENTRY : CHANGE), onMidpoint: entry ? settle : undefined })),
      entry ? 0 : DIP * 1000,
    );
    return () => {
      clearTimeout(id);
      sweep?.cancel();
      current.sweep.setAlpha(0);
      current.sweep.setProgress(0);
    };
  }, [tone, reduceMotion]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The shader leaves a faint halo across the whole canvas; the mask cuts it so the band ends in white.
          On phones the cut lands 324px above the bottom at any height, where the bottom-aligned list starts at 393x852. */}
      <canvas
        ref={restCanvas}
        className="absolute inset-0 h-[calc((100svh-324px)/0.62)] w-full sm:h-[50svh] [mask-image:linear-gradient(to_bottom,black_40%,transparent_62%)]"
      />
      <canvas ref={sweepCanvas} className="absolute inset-0 size-full" />
    </div>
  );
}
