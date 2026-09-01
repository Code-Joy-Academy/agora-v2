import { useEffect, useRef, useState } from 'react';
import { api, WS_BASE } from '../api';
import ScaffoldMeter from './ScaffoldMeter';
import MasteryBadge from './MasteryBadge';
import type { KnowledgeNode, MasteryLabel, SessionUser, TurnMessage } from '../types';

const LABEL_FOR = (p: number): MasteryLabel => (p >= 0.8 ? 'Mastered' : p >= 0.5 ? 'Familiar' : p >= 0.25 ? 'Exploring' : 'New');

export default function ChatInterface({ user, node, onBack }: { user: SessionUser; node: KnowledgeNode; onBack: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [attempt, setAttempt] = useState('');
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [mastery, setMastery] = useState(node.p_mastery);
  const [scaffoldLevel, setScaffoldLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const turnStartRef = useRef<number>(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.startSession(user.id, user.course_id, node.id).then((r) => {
      setSessionId(r.session_id);
      setQuestion(r.question);
      turnStartRef.current = Date.now();
    });
    const ws = new WebSocket(`${WS_BASE}?course_id=${user.course_id}&role=Student&student_id=${user.id}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'teacher_override') setMessages((m) => [...m, { role: 'teacher_override', content: msg.payload.message }]);
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [user.id, user.course_id, node.id]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async () => {
    if (!attempt.trim() || !sessionId || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: 'student', content: attempt }]);
    const currentAttempt = attempt;
    setAttempt('');
    const secondsSpent = Math.round((Date.now() - turnStartRef.current) / 1000);

    const result = await api.postTurn(sessionId, {
      student_id: user.id, course_id: user.course_id, node_id: node.id, question, studentAttempt: currentAttempt, secondsSpent,
    });
    setMessages((m) => [...m, { role: 'tutor', content: result.message, scaffold_level: result.scaffold_level }]);
    setMastery(result.state.p_mastery);
    setScaffoldLevel(result.scaffold_level);
    turnStartRef.current = Date.now();
    setBusy(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button onClick={onBack} className="text-xs font-mono text-cream/40 hover:text-cream mb-4">&larr; Knowledge Realm</button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-mono text-xs text-exploring uppercase tracking-widest">{node.title}</p>
          <h1 className="font-serif text-lg text-cream">{user.display_name}</h1>
        </div>
        <MasteryBadge label={LABEL_FOR(mastery)} />
      </div>

      {node.sample_passage && (
        <div className="border border-slatemid rounded-lg p-4 mb-4 bg-slatemid/20">
          <p className="text-xs font-mono text-cream/50 mb-1">Passage</p>
          <p className="text-cream font-serif italic">"{node.sample_passage}"</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-cream/50">Mastery</span>
          <div className="w-28 h-1.5 bg-slatemid rounded-full overflow-hidden">
            <div className="h-full bg-familiar rounded-full transition-all" style={{ width: `${mastery * 100}%` }} />
          </div>
        </div>
        <ScaffoldMeter level={scaffoldLevel} compact />
      </div>

      <div className="space-y-3 mb-4 min-h-[240px]">
        {question && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-cream text-realm font-serif">{question}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'student' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
              m.role === 'student' ? 'bg-familiar text-realm' :
              m.role === 'teacher_override' ? 'bg-exploring/20 border border-exploring text-exploring font-mono text-xs' :
              'bg-cream text-realm font-serif'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input value={attempt} onChange={(e) => setAttempt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Your thinking…"
          className="flex-1 bg-slatemid/30 border border-slatemid rounded px-3 py-2.5 text-sm text-cream outline-none focus:border-familiar" />
        <button onClick={send} disabled={busy}
          className="px-5 py-2.5 bg-exploring text-realm rounded text-sm font-semibold hover:brightness-110 disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
