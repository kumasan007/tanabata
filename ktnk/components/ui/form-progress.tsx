export type ProgressStep = { key: string; label: string };

export function FormProgress({ steps, currentKey }: { steps: ProgressStep[]; currentKey: string }) {
  const current = Math.max(0, steps.findIndex((step) => step.key === currentKey));
  return (
    <div className="panel sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 p-3 shadow-sm sm:top-[calc(4rem+env(safe-area-inset-top))]" aria-label={`入力の進み具合 ${current + 1}/${steps.length}`}>
      <div className="mb-2 flex items-center justify-between text-sm"><span className="font-bold text-primary">{steps[current]?.label}</span><span className="text-slate-500">{current + 1}/{steps.length}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((current + 1) / steps.length) * 100}%` }} /></div>
    </div>
  );
}
