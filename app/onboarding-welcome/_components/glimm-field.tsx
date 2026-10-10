import { accentPair, createShader, type Palette } from "glimm";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Band parked low on each canvas; it drifts up by BREATH and back. */
const REST = 0.3;
const BREATH = 0.05;

const FIELD = accentPair("#0024F2", "#18FFFF");
const CORE = accentPair("#0030F0", "#0A70F8");

/**
 * The welcome gradient: a cyan-to-blue Glimm field rising from the bottom, with a deeper blue
 * core under the buttons. CSS masks only shape the falloff into white.
 */
export function GlimmField() {
  return (
    <>
      <GlimmLayer
        palette={FIELD}
        className="h-[60%] [mask-image:radial-gradient(120%_100%_at_50%_100%,#000_70%,rgb(0_0_0/0.55)_82%,transparent_95%)]"
      />
      <GlimmLayer
        palette={CORE}
        className="h-[34%] [mask-image:radial-gradient(75%_100%_at_50%_100%,#000_30%,transparent_100%)]"
      />
    </>
  );
}

function GlimmLayer({ palette, className }: { palette: Palette; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const shader = canvas && createShader({ canvas, palette, direction: "btt", bandTight: 0.3, swellAmount: 0, waveSpeed: reduceMotion ? 0 : 1 });
    if (!shader) return;

    const born = performance.now();
    // Glimm rolls the palette phase forward 0.02 per second; cancel it so blue stays at the bottom.
    const pinHue = () => {
      const shift = (-0.02 * (performance.now() - born)) / 1000;
      const [r, g, b] = palette.d;
      shader.setPalette({ ...palette, d: [r + shift, g + shift, b + shift] });
    };

    const breath = reduceMotion ? 0 : BREATH;
    shader.setProgress(REST);
    // Above 1 to cancel the shader's entry fade, so the band is opaque and the mask alone shapes the falloff.
    shader.setAlpha(1.15);
    const breathing = animate(0, 1, {
      duration: 5,
      repeat: Infinity,
      repeatType: "mirror",
      ease: "easeInOut",
      onUpdate: (v) => {
        shader.setProgress(REST + v * breath);
        pinHue();
      },
    });

    return () => {
      breathing.stop();
      shader.destroy();
    };
  }, [palette, reduceMotion]);

  return (
    <motion.canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    />
  );
}
