import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ScaffoldRules } from '../types';

export default function PedagogySlider({ courseId }: { courseId: string }) {
  const [rules, setRules] = useState<ScaffoldRules | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.course(courseId).then((c) => setRules(c.scaffold_rules)); }, [courseId]);

  const commit = async (directness: number) => {
    if (!rules) return;
    const next = { ...rules, pedagogy_directness: directness };
    setRules(next);
    setSaving(true);
    await api.updateRules(courseId, next);
    setSaving(false);
  };

  if (!rules) return null;

  return (
    <div className="border border-slatemid rounded-lg p-4 bg-slatemid/20">
      <p className="font-mono text-xs text-exploring uppercase tracking-widest mb-3">Pedagogy Style</p>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] font-mono text-cream/50 w-16">Socratic</span>
        <input type="range" min={0} max={1} step={0.05} value={rules.pedagogy_directness}
          onChange={(e) => commit(Number(e.target.value))}
          className="flex-1 accent-familiar" />
        <span className="text-[10px] font-mono text-cream/50 w-12 text-right">Direct</span>
      </div>
      <p className="text-[10px] font-mono text-cream/30">{saving ? 'Saving…' : `${Math.round(rules.pedagogy_directness * 100)}% direct — applies to every scaffold response`}</p>
    </div>
  );
}
