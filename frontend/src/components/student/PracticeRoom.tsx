import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import type { CurriculumNode, MasteryState } from '../../types';
import { MathRenderer } from '../shared/MathRender';

interface Message {
  id: string;
  sender: 'tutor' | 'student';
  text: string;
  time: string;
  scaffoldLevel?: number;
}

interface PracticeRoomProps {
  courseId: string;
  studentId: string;
  node: CurriculumNode;
  onExit: () => void;
}

export function PracticeRoom({ courseId, studentId, node, onExit }: PracticeRoomProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionPrompt, setQuestionPrompt] = useState<string>('');
  const [inputAttempt, setInputAttempt] = useState<string>('');
  const [mastery, setMastery] = useState<MasteryState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    api.startSession(studentId, courseId, node.id).then((res) => {
      if (!mounted) return;
      setSessionId(res.session_id);
      setQuestionPrompt(res.question);
      setMastery(res.state);
      setMessages([
        {
          id: 'welcome',
          sender: 'tutor',
          text: `Welcome! Let's examine **${node.title}**. Read the problem and passage on the left, then share your first step.`,
          time: 'Just now',
          scaffoldLevel: 0,
        },
      ]);
    });
    return () => {
      mounted = false;
    };
  }, [courseId, studentId, node.id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputAttempt.trim() || !sessionId || loading) return;

    const userText = inputAttempt.trim();
    setInputAttempt('');
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'student',
        text: userText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setLoading(true);
    try {
      const res = await api.submitTurn({
        session_id: sessionId,
        student_id: studentId,
        course_id: courseId,
        node_id: node.id,
        studentAttempt: userText,
        secondsSpent: 15,
      });

      setMastery(res.state);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'tutor',
          text: res.message,
          scaffoldLevel: res.scaffold_level,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'tutor',
          text: 'Let us pause and rethink this step carefully.',
          time: 'Just now',
          scaffoldLevel: 1,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const isMath = node.pack_id.includes('math');

  return (
    <div className="max-w-container-max mx-auto px-4 md:px-8 py-6 flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Top Context & Progress Bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold">
            <span className="material-symbols-outlined">psychology</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-on-surface">{node.title}</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container text-xs font-semibold text-primary">
                {isMath ? 'Mathematics' : 'English'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">{node.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-medium">Mastery</span>
            <div className="w-24 bg-surface-container rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-500"
                style={{ width: `${Math.round((mastery?.p_mastery ?? 0.1) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-primary">{Math.round((mastery?.p_mastery ?? 0.1) * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Save & Exit
          </button>
        </div>
      </div>

      {/* Dual Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        {/* Left Pane: Problem Context / Reading Passage */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 border border-outline-variant/30 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed/40 text-on-primary-fixed text-xs font-semibold">
                <span className="material-symbols-outlined text-sm">quiz</span>
                {isMath ? 'Step-by-Step Problem' : 'Passage & Context'}
              </span>
            </div>

            {node.sample_passage && (
              <div className="mb-5 p-5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="text-xs font-bold uppercase tracking-wider text-secondary block mb-2">
                  {isMath ? 'Reference Equation' : 'Text Passage'}
                </span>
                <div className="text-on-surface text-base leading-relaxed italic border-l-4 border-primary pl-4">
                  <MathRenderer content={node.sample_passage} />
                </div>
              </div>
            )}

            <h2 className="text-lg font-bold text-on-surface mb-3">Focus Question:</h2>
            <div className="p-4 rounded-xl bg-surface-bright border border-outline-variant/30 text-primary text-base font-semibold">
              <MathRenderer content={questionPrompt || 'Loading prompt...'} />
            </div>
          </div>
        </div>

        {/* Right Pane: Socratic Tutor Chat */}
        <div className="lg:col-span-5 flex flex-col h-[650px] bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="p-4 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
              </div>
              <div>
                <span className="text-sm font-bold text-on-surface block leading-tight">Agora AI Companion</span>
                <span className="text-xs text-secondary font-medium">Socratic Scaffolding</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-2.5 max-w-[90%] ${m.sender === 'student' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                    m.sender === 'student' ? 'bg-primary-fixed text-primary' : 'bg-primary text-on-primary'
                  }`}
                >
                  {m.sender === 'student' ? 'M' : 'A'}
                </div>
                <div
                  className={`p-3.5 rounded-2xl shadow-xs text-sm ${
                    m.sender === 'student'
                      ? 'bg-primary text-on-primary rounded-tr-xs'
                      : 'bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-tl-xs'
                  }`}
                >
                  <MathRenderer content={m.text} />
                  <span
                    className={`block mt-1 text-[10px] ${
                      m.sender === 'student' ? 'text-primary-fixed-dim text-right' : 'text-outline'
                    }`}
                  >
                    {m.time}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-outline p-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                Agora is thinking...
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Quick Math Toolbar */}
          {isMath && (
            <div className="px-3 py-1.5 bg-surface-container-low border-t border-outline-variant/20 flex items-center gap-1.5 overflow-x-auto">
              {['x²', '+', '-', '×', '÷', '(', ')', '=', '\\sqrt{}'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInputAttempt((prev) => prev + s)}
                  className="px-2 py-1 rounded bg-surface-container-lowest text-xs font-bold text-on-surface border border-outline-variant/30 hover:bg-surface-container active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 bg-surface-container-lowest border-t border-outline-variant/30">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={inputAttempt}
                onChange={(e) => setInputAttempt(e.target.value)}
                placeholder={isMath ? 'Type your step or equation...' : 'Provide analysis or evidence...'}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 focus:border-primary focus:ring-1 focus:ring-primary text-sm text-on-surface outline-none"
              />
              <button
                type="submit"
                disabled={loading || !inputAttempt.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <span>Send</span>
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}