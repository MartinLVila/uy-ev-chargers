"use client";

import { useEffect, useRef, type RefObject } from "react";

export type BoxEdges = {
  paddingTop: number;
  paddingBottom: number;
  borderTop: number;
  borderBottom: number;
};

export function totalStickyHeight(contentHeight: number, edges: BoxEdges): number {
  const total =
    contentHeight + edges.paddingTop + edges.paddingBottom + edges.borderTop + edges.borderBottom;
  return Math.ceil(Math.max(0, total));
}

function edgesOf(element: HTMLElement): BoxEdges {
  const style = getComputedStyle(element);
  return {
    paddingTop: parseFloat(style.paddingTop) || 0,
    paddingBottom: parseFloat(style.paddingBottom) || 0,
    borderTop: parseFloat(style.borderTopWidth) || 0,
    borderBottom: parseFloat(style.borderBottomWidth) || 0,
  };
}

export function useMeasuredStickyHeight(token: string): RefObject<HTMLDivElement | null> {
  const element = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const measured = element.current;
    if (!measured) return;

    const root = document.documentElement;
    const release = () => root.style.removeProperty(token);
    const publish = (height: number) => root.style.setProperty(token, `${height}px`);

    publish(Math.ceil(measured.getBoundingClientRect().height));

    if (typeof ResizeObserver === "undefined") return release;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        publish(totalStickyHeight(entry.contentRect.height, edgesOf(measured)));
      }
    });
    observer.observe(measured);

    return () => {
      observer.disconnect();
      release();
    };
  }, [token]);

  return element;
}
