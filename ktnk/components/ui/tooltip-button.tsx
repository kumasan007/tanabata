"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function TooltipButton({ label, description, className }: { label: string; description: string | null; className?: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, arrow: 0, ready: false });

  useLayoutEffect(() => {
    if (!open || !description) return;
    function reposition() {
      if (!button.current || !tooltip.current) return;
      const anchor = button.current.getBoundingClientRect();
      const bubble = tooltip.current.getBoundingClientRect();
      const center = anchor.left + anchor.width / 2;
      const left = Math.max(8, Math.min(center - bubble.width / 2, window.innerWidth - bubble.width - 8));
      setPosition({ left, top: Math.max(8, anchor.top - bubble.height - 8), arrow: Math.max(8, Math.min(center - left, bubble.width - 8)), ready: true });
    }
    function dismiss(event: PointerEvent) {
      if (!button.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, description]);

  return <>
    <button ref={button} type="button" className={className}
      aria-describedby={open && description ? id : undefined}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}>{label}</button>
    {open && description && createPortal(<div ref={tooltip} id={id} role="tooltip"
      className="pointer-events-none fixed z-[80] w-max max-w-[min(20rem,calc(100vw-1rem))] rounded-md bg-slate-900 px-3 py-2 text-left text-xs leading-5 text-white shadow-lg"
      style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}>
      <p className="whitespace-pre-wrap break-words">{description}</p>
      <span aria-hidden="true" className="absolute -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" style={{ left: position.arrow }} />
    </div>, document.body)}
  </>;
}
