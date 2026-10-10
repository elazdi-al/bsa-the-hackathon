import { accentChain, createShader, playSweep, type Palette, type ShaderController, type SweepOptions } from "glimm";
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

// Step changes: a band of the next colour runs down the screen while the resting band blends into it.
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

type Vec3 = Palette["a"];
const lerp3 = (from: Vec3, to: Vec3, k: number, wrap = false): Vec3 => {
  const at = (i: number) => {
    let delta = to[i] - from[i];
    if (wrap) delta -= Math.round(delta); // cosine phase: take the short way round
    return from[i] + delta * k;
  };
  return [at(0), at(1), at(2)];
};
const mixPalette = (from: Palette, to: Palette, k: number): Palette => ({
  a: lerp3(from.a, to.a, k),
  b: lerp3(from.b, to.b, k),
  c: lerp3(from.c, to.c, k),
  d: lerp3(from.d, to.d, k, true),
});

type Rest = {
  shader: ShaderController;
  palette: Palette;
  alpha?: AnimationPlaybackControls;
  blend?: AnimationPlaybackControls;
};

export function GlimmBackdrop({ tone, visible }: { tone: Tone; visible: boolean }) {
  const restCanvas = useRef<HTMLCanvasElement>(null);
  const sweepCanvas = useRef<HTMLCanvasElement>(null);
  const shaders = useRef<{ rest: Rest; sweep: ShaderController } | null>(null);
  // The resting band stays hidden until the entry flood has revealed it.
  const revealed = useRef(false);
  const reduceMotion = useReducedMotion();

  const restAlpha = visible && tone !== "white" ? REST.alpha : 0;
  const targetAlpha = useRef(restAlpha);

  const fadeRest = (to: number) => {
    const rest = shaders.current?.rest;
    if (!rest) return;
    rest.alpha?.stop();
    rest.alpha = animate(rest.shader.getAlpha(), to, {
      duration: to > 0 ? 0.6 : 0.35,
      ease: reveal.ease,
      onUpdate: (a) => rest.shader.setAlpha(a),
    });
  };

  const blendRest = (to: Palette) => {
    const rest = shaders.current?.rest;
    if (!rest) return;
    const from = rest.palette;
    rest.blend?.stop();
    rest.blend = animate(0, 1, {
      duration: reduceMotion ? 0 : 0.5,
      ease: reveal.ease,
      onUpdate: (k) => {
        rest.palette = mixPalette(from, to, k);
        rest.shader.setPalette(rest.palette);
      },
    });
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
    const rest: Rest = { shader, palette: PALETTES.blue };
    shaders.current = { rest, sweep };
    revealed.current = false;
    return () => {
      rest.alpha?.stop();
      rest.blend?.stop();
      shader.destroy();
      sweep.destroy();
      shaders.current = null;
    };
  }, []);

  useEffect(() => {
    targetAlpha.current = restAlpha;
    if (revealed.current) fadeRest(restAlpha);
  }, [restAlpha]);

  useEffect(() => {
    const current = shaders.current;
    if (!current) return;
    const settle = () => {
      blendRest(PALETTES[tone]);
      revealed.current = true;
      fadeRest(targetAlpha.current);
    };
    if (reduceMotion) {
      settle();
      return;
    }
    const sweep = playSweep(current.sweep, {
      palette: PALETTES[tone],
      ...(tone === "blue" ? ENTRY : CHANGE),
      onMidpoint: settle,
    });
    return () => {
      sweep.cancel();
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
