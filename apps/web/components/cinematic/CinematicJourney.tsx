"use client";

import { useEffect, useRef } from "react";
import { journeyMarkup } from "./markup";
import "./cinematic.css";

// Keep the opaque subtree stable when React renders the mount again.
const presentationMarkup = { __html: journeyMarkup };

type JourneyModule = { mountJourney(root: HTMLElement): () => void };

export function CinematicJourney() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const element = root.current;
    if (!element) return;
    // Local native ESM keeps the supplied Three.js runtime outside the React bundle.
    // It also leaves the editable scene modules available to Vite and Next.js.
    const moduleUrl = "/cinematic/main.js";
    void (import(/* webpackIgnore: true */ moduleUrl) as Promise<JourneyModule>)
      .then((module) => {
        if (!cancelled) dispose = module.mountJourney(element);
      })
      .catch(() => {
        if (cancelled) return;
        element.classList.remove("preparing");
        element.classList.add("static-mode");
        const reason = element.querySelector("#fallback-reason");
        if (reason) reason.textContent = "โหลดประสบการณ์ 3D ไม่สำเร็จ คุณยังอ่านขั้นตอนติดตามแปลงด้านล่างได้";
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [journeyMarkup]);

  return <div ref={root} className="cinematic static-mode" dangerouslySetInnerHTML={presentationMarkup} />;
}
