const LABELS = ['Open Exploration', 'Conceptual Nudge', 'Sub-Goal', 'Worked Analog', 'Teacher Alert'];

export default function ScaffoldMeter({ level, compact }: { level: number; compact?: boolean }) {
  return (
    <div className="flex items-end gap-1" title={LABELS[level]}>
      {LABELS.map((label, i) => (
        <div key={i} className="flex flex-col items-center" style={{ width: compact ? 10 : 18 }}>
          <div
            className={`w-full rounded-sm transition-all ${i <= level ? (i === 4 ? 'bg-crimson' : 'bg-familiar') : 'bg-slatemid'}`}
            style={{ height: compact ? 6 + i * 4 : 8 + i * 7 }}
          />
          {!compact && <span className="text-[9px] text-cream/40 mt-1 font-mono">{i}</span>}
        </div>
      ))}
    </div>
  );
}
