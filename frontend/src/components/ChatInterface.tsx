import { useEffect, useRef, useState } from 'react';
import { api, WS_BASE } from '../api';
import ScaffoldMeter from './ScaffoldMeter';
import MasteryBadge from './MasteryBadge';
import type {
  KnowledgeNode,
  MasteryLabel,
  SessionUser,
  TurnMessage,
} from '../types';

const LABEL_FOR = (p: number): MasteryLabel =>
  p >= 0.8
    ? 'Mastered'
    : p >= 0.5
      ? 'Familiar'
      : p >= 0.25
        ? 'Exploring'
        : 'New';

export default function ChatInterface({
  user,
  node,
  onBack,
}: {
  user: SessionUser;
  node: KnowledgeNode;
  onBack: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [attempt, setAttempt] = useState('');
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [mastery, setMastery] = useState(node.p_mastery);
  const [scaffoldLevel, setScaffoldLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const turnStartRef = useRef<number>(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
        let cancelled = false;

        setSessionId(null);
        setQuestion('');
        setMessages([]);
        setMastery(node.p_mastery);
        setScaffoldLevel(0);
        setSessionError(null);
        turnStartRef.current = Date.now();

        api
            .startSession(user.course_id, node.id,)
            .then((result) => {
              if (cancelled) return;

              setSessionId(result.session_id);
              setQuestion(result.question);
              turnStartRef.current = Date.now();
            })
            .catch((error: unknown) => {
              if (cancelled) return;

              setSessionError(
                  error instanceof Error
                      ? error.message
                      : 'Could not start your practice session.',
              );
            });

        const ws = new WebSocket(
            `${WS_BASE}/ws?course_id=${encodeURIComponent(user.course_id)}`,
        );

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'teacher_override') {
              setMessages((current) => [
                ...current,
                {
                  role: 'teacher_override',
                  content: msg.payload.message,
                },
              ]);
            }
          } catch {
            // Ignore malformed WebSocket messages.
          }
        };

        return () => {
          cancelled = true;
          ws.close();
        };
      },
      [user.course_id, node.id, node.p_mastery]);

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

const send = async () => {
  const currentAttempt = attempt.trim();

  if (!currentAttempt || !sessionId || busy) return;

  setBusy(true);
  setAttempt('');

  setMessages((current) => [
    ...current,
    { role: 'student', content: currentAttempt },
  ]);

  const secondsSpent = Math.round(
      (Date.now() - turnStartRef.current) / 1000,
  );

  try {
    const result = await api.postTurn(sessionId, {
      studentAttempt: currentAttempt,
      secondsSpent,
    });

    setMessages((current) => [
      ...current,
      {
        role: 'tutor',
        content: result.message,
        scaffold_level: result.scaffold_level,
      },
    ]);

    setMastery(result.state.p_mastery);
    setScaffoldLevel(result.scaffold_level);
    turnStartRef.current = Date.now();
  } catch (error) {
    setMessages((current) => [
      ...current,
      {
        role: 'tutor',
        content:
            error instanceof Error
                ? error.message
                : 'Could not submit your response.',
      },
    ]);
  } finally {
    setBusy(false);
  }
};

return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button
          onClick={onBack}
          className="text-xs font-mono text-cream/40 hover:text-cream mb-4"
      >
        &larr; Knowledge Realm
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-mono text-xs text-exploring uppercase tracking-widest">
            {node.title}
          </p>
          <h1 className="font-serif text-lg text-cream">
            {user.display_name}
          </h1>
        </div>

        <MasteryBadge label={LABEL_FOR(mastery)} />
      </div>

      {node.sample_passage && (
          <div className="border border-slatemid rounded-lg p-4 mb-4 bg-slatemid/20">
            <p className="text-xs font-mono text-cream/50 mb-1">
              Passage
            </p>
            <p className="text-cream font-serif italic">
              "{node.sample_passage}"
            </p>
          </div>
      )}

      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-cream/50">
            Mastery
          </span>

          <div className="w-28 h-1.5 bg-slatemid rounded-full overflow-hidden">
            <div
                className="h-full bg-familiar rounded-full transition-all"
                style={{ width: `${mastery * 100}%` }}
            />
          </div>
        </div>

        <ScaffoldMeter level={scaffoldLevel} compact />
      </div>

      {sessionError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {sessionError}
          </div>
      )}

      <div className="space-y-3 mb-4 min-h-[240px]">
        {question && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-cream text-realm font-serif">
                {question}
              </div>
            </div>
        )}

        {messages.map((message, index) => (
            <div
                key={index}
                className={
                  message.role === 'student'
                      ? 'flex justify-end'
                      : 'flex justify-start'
                }
            >
              <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                      message.role === 'student'
                          ? 'bg-familiar text-realm'
                          : message.role === 'teacher_override'
                              ? 'bg-exploring/20 border border-exploring text-exploring font-mono text-xs'
                              : 'bg-cream text-realm font-serif'
                  }`}
              >
                {message.content}
              </div>
            </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
            value={attempt}
            onChange={(event) => setAttempt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Your thinking…"
            disabled={!sessionId || busy || !!sessionError}
            className="flex-1 bg-slatemid/30 border border-slatemid rounded px-3 py-2.5 text-sm text-cream outline-none focus:border-familiar disabled:opacity-50"
        />

        <button
            onClick={() => void send()}
            disabled={busy || !sessionId || !!sessionError || !attempt.trim()}
            className="px-5 py-2.5 bg-exploring text-realm rounded text-sm font-semibold hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
);
}
