"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/ui/format";

const DURATION_MS = 1400;

function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3;
}

export function HeroCount({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    function tick(startedAt: number, timestamp: number) {
      const elapsed = timestamp - startedAt;
      const progress = Math.min(1, elapsed / DURATION_MS);
      setDisplay(Math.round(easeOutCubic(progress) * value));
      if (progress < 1) frame = requestAnimationFrame((next) => tick(startedAt, next));
    }

    function run() {
      setDisplay(0);
      frame = requestAnimationFrame((first) => tick(first, first));
    }

    run();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") run();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [value]);

  return (
    <span className={className} style={style}>
      {formatNumber(display)}
    </span>
  );
}
