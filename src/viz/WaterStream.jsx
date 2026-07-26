import { useEffect, useMemo, useRef } from "react";
import P5Sketch from "./P5Sketch.jsx";
import { illustratedWaterStreamSketch } from "./illustratedWaterStreamSketch.js";

/**
 * React owns the container; three.js owns what's inside it. Mirrors the
 * P5Sketch contract: dynamic import keeps three (~170 KB gzip) out of the
 * initial bundle, and the scene's dispose() runs on unmount/prop change so a
 * WebGL context never leaks. The "not reported" dotted device lives here in
 * DOM (not the canvas) so it stays crisp and screen-reader-visible.
 */
export default function WaterStream({
  result,
  hidden,
  mode = "real",
  unreportedLabel = "Lead result not reported",
}) {
  const sketchData = useMemo(() => ({ result, hidden }), [result, hidden]);
  const unmeasured = result?.lead?.value == null;

  return (
    <div className="relative">
      {mode === "drawn" ? (
        <div className="drawn-stream flex justify-center">
          <P5Sketch sketch={illustratedWaterStreamSketch} data={sketchData} />
        </div>
      ) : (
        <RealWaterStream result={result} hidden={hidden} />
      )}
      {unmeasured && (
        <p className="label-caps pointer-events-none absolute left-1/2 top-[58%] w-max max-w-[82%] -translate-x-1/2 rounded-xl border border-dashed border-ink-muted/70 px-4 py-2 text-center !text-ink-muted">
          {unreportedLabel}
        </p>
      )}
    </div>
  );
}

function RealWaterStream({ result, hidden }) {
  const ref = useRef(null);

  useEffect(() => {
    let dispose;
    let live = true;
    Promise.all([import("three"), import("./waterStreamScene.js")]).then(
      ([THREE, { createWaterStream }]) => {
        if (!live || !ref.current) return;
        dispose = createWaterStream(THREE, ref.current, { result, hidden });
      },
    );
    return () => {
      live = false;
      dispose?.();
    };
  }, [result, hidden]);

  return <div ref={ref} className="flex justify-center" />;
}
