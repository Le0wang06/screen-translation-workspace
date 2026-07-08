"use client";

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type ImageCompareSliderProps = {
  originalUrl: string;
  translatedUrl: string;
  originalAlt?: string;
  translatedAlt?: string;
  className?: string;
};

export function ImageCompareSlider({
  originalUrl,
  translatedUrl,
  originalAlt = "Original screenshot",
  translatedAlt = "Translated screenshot",
  className,
}: ImageCompareSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={containerRef}
        className="relative w-full select-none overflow-hidden rounded-lg border border-border/60 bg-muted/20"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updatePosition(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          updatePosition(event.clientX);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={translatedUrl}
          alt={translatedAlt}
          className="block h-auto w-full"
          draggable={false}
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalUrl}
            alt={originalAlt}
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
        <div
          className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${position}%` }}
          aria-hidden
        />
        <div
          className="absolute top-1/2 z-20 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background shadow-md"
          style={{ left: `${position}%` }}
          aria-hidden
        >
          <span className="text-xs text-muted-foreground">↔</span>
        </div>
        <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm">
          Original
        </div>
        <div className="pointer-events-none absolute top-3 right-3 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm">
          Translated
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        className="w-full accent-primary"
        aria-label="Compare original and translated screenshots"
      />
    </div>
  );
}
