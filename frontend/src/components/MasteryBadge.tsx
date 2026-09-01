import type { MasteryLabel } from '../types';

const COLORS: Record<MasteryLabel, string> = {
  New: 'bg-newnode', Exploring: 'bg-exploring', Familiar: 'bg-familiar', Mastered: 'bg-mastered',
};

export default function MasteryBadge({ label }: { label: MasteryLabel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full ${COLORS[label]}/20 text-cream/80`}>
      <span className={`w-1.5 h-1.5 rounded-full ${COLORS[label]}`} />
      {label}
    </span>
  );
}
