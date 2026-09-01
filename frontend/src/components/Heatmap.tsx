import type { HeatmapCell } from '../types';

function cellColor(avg: number): string {
  if (avg >= 0.8) return 'bg-mastered/70';
  if (avg >= 0.5) return 'bg-familiar/70';
  if (avg >= 0.25) return 'bg-exploring/70';
  return 'bg-newnode/70';
}

export default function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.node_id} className={`rounded-lg p-3 ${cellColor(c.avg_mastery)}`}>
          <p className="text-xs text-realm font-serif font-semibold">{c.title}</p>
          <p className="text-[10px] text-realm/70 font-mono mt-1">{Math.round(c.avg_mastery * 100)}% avg · {c.student_count} students</p>
        </div>
      ))}
      {cells.length === 0 && <p className="text-xs font-mono text-cream/30 col-span-3">No student activity yet</p>}
    </div>
  );
}
