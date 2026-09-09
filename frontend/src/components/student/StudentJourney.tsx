import { useState } from 'react';
import type { CurriculumNode } from '../../types';

interface StudentJourneyProps {
  userName: string;
  nodes: CurriculumNode[];
  activePackId: string;
  onSelectPack: (packId: string) => void;
  onSelectNode: (node: CurriculumNode) => void;
}

export function StudentJourney({
  userName,
  nodes,
  activePackId,
  onSelectPack,
  onSelectNode,
}: StudentJourneyProps) {
  const [selectedStrand, setSelectedStrand] = useState<string>('all');

  // Filter nodes by strand if selected
  const filteredNodes = selectedStrand === 'all' 
    ? nodes 
    : nodes.filter((n) => n.strand.toLowerCase() === selectedStrand.toLowerCase());

  const currentNode = filteredNodes[1] ?? filteredNodes[0] ?? nodes[0];
  const overallMastery = Math.round(
    (nodes.reduce((acc, n) => acc + (n.p_mastery ?? 0.1), 0) / Math.max(1, nodes.length)) * 100
  );

  // Extract unique strands in the active pack
  const strands = Array.from(new Set(nodes.map((n) => n.strand)));

  return (
    <main className="max-w-container-max mx-auto px-4 md:px-8 py-8 space-y-8">
      {/* Top Subject Switcher Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">school</span>
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Current Subject:
          </span>
        </div>

        {/* Dropdown to switch between Math and English */}
        <div className="flex items-center gap-2">
          <select
            value={activePackId}
            onChange={(e) => onSelectPack(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
          >
            <option value="cambridge-math-stage-9">📐 Cambridge Grade 9 Mathematics</option>
            <option value="cambridge-stage8-english">📖 Cambridge Stage 8 English</option>
          </select>
        </div>
      </div>

      {/* Hero Greeting Spotlight */}
      <section className="rounded-3xl bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-low border border-outline-variant/30 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-primary text-xs font-semibold shadow-xs">
              Steady Progress Active
            </span>
            <h1 className="text-3xl font-bold text-on-surface tracking-tight">Welcome back, {userName}! 👋</h1>
            <p className="text-base text-on-surface-variant">
              Exploring <strong className="text-primary font-semibold">{activePackId.includes('math') ? 'Grade 9 Mathematics' : 'Stage 8 English'}</strong>. Ready to practice?
            </p>
          </div>

          {currentNode && (
            <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/40 shadow-sm space-y-3 min-w-[320px]">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="px-2.5 py-0.5 rounded-full bg-primary-fixed text-primary font-bold">Recommended Step</span>
                <span>~10 mins</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">{currentNode.title}</h2>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{currentNode.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectNode(currentNode)}
                className="w-full py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <span>Continue Practice</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Grid: Journey Map & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Curriculum Mastery Map</h2>
              <p className="text-xs text-on-surface-variant">Socratic checkpoints for {activePackId.includes('math') ? 'Mathematics' : 'English'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">Mastery:</span>
              <div className="w-24 h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-secondary rounded-full" style={{ width: `${overallMastery}%` }} />
              </div>
              <span className="text-xs font-bold text-on-surface">{overallMastery}%</span>
            </div>
          </div>

          {/* Strand filter chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedStrand('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selectedStrand === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              All Strands
            </button>
            {strands.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedStrand(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                  selectedStrand === s
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredNodes.map((n, idx) => {
              const p = n.p_mastery ?? 0.1;
              const isMastered = p >= 0.8;
              const isExploring = p > 0.2 && p < 0.8;

              return (
                <div
                  key={n.id}
                  onClick={() => onSelectNode(n)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isExploring
                      ? 'bg-surface-container-low border-2 border-primary shadow-xs'
                      : 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isMastered
                          ? 'bg-secondary-fixed text-on-secondary-fixed'
                          : isExploring
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-on-surface">{n.title}</h3>
                        <span className="text-[11px] font-semibold text-outline uppercase">{n.strand}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{n.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isMastered
                          ? 'bg-secondary-fixed/60 text-on-secondary-container'
                          : isExploring
                          ? 'bg-primary-fixed text-primary'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {Math.round(p * 100)}% Mastery
                    </span>
                    <span className="material-symbols-outlined text-outline">chevron_right</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Goal Tracker */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-on-surface flex items-center justify-between">
              <span>Today's Goal</span>
              <span className="material-symbols-outlined text-primary text-lg">flag</span>
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>Complete 1 Socratic dialog</span>
                <span className="text-primary font-bold">1 / 1</span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full w-full" />
              </div>
            </div>
            <p className="text-xs text-on-surface-variant bg-surface-container-low p-3 rounded-xl border border-outline-variant/20">
              🎯 Keep your streak active by testing your knowledge today!
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}