import { useEffect, useState } from 'react';
import { api } from '../api';
import MasteryBadge from './MasteryBadge';
import type { KnowledgeNode } from '../types';

export default function KnowledgeRealm({ courseId, studentId, onPick, onExploratory }: {
  courseId: string; studentId: string; onPick: (node: KnowledgeNode) => void; onExploratory: () => void;
}) {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);

  useEffect(() => { api.knowledgeMap(courseId, studentId).then(setNodes); }, [courseId, studentId]);

  const strands = [...new Set(nodes.map((n) => n.strand))];
  const strandLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-exploring uppercase tracking-widest mb-1">Knowledge Realm</p>
          <h1 className="font-serif text-xl text-cream">Pick a topic</h1>
        </div>
        <button onClick={onExploratory} className="text-xs font-mono text-familiar border border-familiar/40 rounded-full px-3 py-1.5 hover:bg-familiar/10">
          Ask a question instead
        </button>
      </div>

      <div className="space-y-6">
        {strands.map((strand) => (
          <div key={strand}>
            <p className="text-xs font-mono text-cream/40 uppercase tracking-widest mb-2">{strandLabel(strand)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {nodes.filter((n) => n.strand === strand).map((n) => (
                <button key={n.id} onClick={() => onPick(n)}
                  className="text-left border border-slatemid bg-slatemid/20 hover:border-familiar/50 rounded-lg p-4 transition">
                  <p className="font-serif text-cream mb-2">{n.title}</p>
                  <MasteryBadge label={n.mastery_label} />
                  <div className="w-full h-1.5 bg-realm rounded-full overflow-hidden mt-3">
                    <div className="h-full bg-familiar rounded-full transition-all" style={{ width: `${n.p_mastery * 100}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {nodes.length === 0 && <p className="text-xs font-mono text-cream/30">No curriculum nodes for this course's pack yet.</p>}
      </div>
    </div>
  );
}
