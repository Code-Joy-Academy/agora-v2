import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { api } from '../api';
import type { SessionUser } from '../types';

import 'katex/dist/katex.min.css';

type Message = {
  role: 'student' | 'tutor';
  content: string;
};

export default function ExploratoryView({
  user,
  onBack,
}: {
  user: SessionUser;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery || busy) return;

    setBusy(true);
    setError(null);

    setThread((current) => [
      ...current,
      {
        role: 'student',
        content: trimmedQuery,
      },
    ]);

    setQuery('');

    try {
      const result = await api.askExploratory({
        course_id: user.course_id,
        node_id: null,
        studentQuery: trimmedQuery,
      });

      setThread((current) => [
        ...current,
        {
          role: 'tutor',
          content: result.answer,
        },
      ]);
    } catch (err) {
      console.error(
        'Exploratory question failed:',
        err,
      );

      setError(
        'I could not reach the tutor right now. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void ask();
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button
        onClick={onBack}
        className="text-xs font-mono text-cream/40 hover:text-cream transition-colors mb-5"
      >
        &larr; Knowledge Realm
      </button>

      <div className="mb-7">
        <p className="font-mono text-xs text-exploring uppercase tracking-widest mb-1">
          Exploratory Mode
        </p>

        <h1 className="font-serif text-lg text-cream">
          Ask anything about the course
        </h1>

        <p className="text-xs text-cream/40 mt-2 leading-relaxed">
          Explore concepts freely. The tutor draws from the
          syllabus and uploaded learning resources.
        </p>
      </div>

      <div
        className="space-y-4 mb-5 min-h-[240px]"
        aria-live="polite"
      >
        {thread.length === 0 && (
          <div className="border border-slatemid/60 rounded-lg p-5">
            <p className="text-xs font-mono text-cream/30 leading-relaxed">
              Try asking:
            </p>

            <div className="mt-3 space-y-2 text-sm text-cream/60">
              <p>
                “What is the difference between tone and mood?”
              </p>

              <p>
                “Why do authors use imagery?”
              </p>

              <p>
                “Can you explain linear equations?”
              </p>

              <p>
                “What happens if x = 5 in 3x + 7?”
              </p>
            </div>
          </div>
        )}

        {thread.map((message, index) => {
          const isStudent =
            message.role === 'student';

          return (
            <div
              key={`${message.role}-${index}`}
              className={
                isStudent
                  ? 'flex justify-end'
                  : 'flex justify-start'
              }
            >
              <div
                className={
                  isStudent
                    ? 'max-w-[85%] rounded-lg px-4 py-3 bg-familiar text-realm text-sm leading-relaxed'
                    : 'max-w-[90%] rounded-lg px-4 py-3 bg-cream text-realm text-sm leading-relaxed'
                }
              >
                {!isStudent && (
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-2">
                    Agora
                  </p>
                )}

                <div
                  className={
                    isStudent
                      ? 'prose prose-sm max-w-none'
                      : 'prose prose-sm max-w-none'
                  }
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ children }) => (
                        <h3 className="font-serif text-base font-semibold mb-2">
                          {children}
                        </h3>
                      ),

                      h2: ({ children }) => (
                        <h3 className="font-serif text-base font-semibold mb-2">
                          {children}
                        </h3>
                      ),

                      h3: ({ children }) => (
                        <h4 className="font-serif text-sm font-semibold mb-2">
                          {children}
                        </h4>
                      ),

                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">
                          {children}
                        </p>
                      ),

                      ul: ({ children }) => (
                        <ul className="list-disc pl-5 mb-2 space-y-1">
                          {children}
                        </ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="list-decimal pl-5 mb-2 space-y-1">
                          {children}
                        </ol>
                      ),

                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-realm/30 pl-3 my-2 italic">
                          {children}
                        </blockquote>
                      ),

                      code: ({
                        className,
                        children,
                        ...props
                      }) => (
                        <code
                          className={`${className ?? ''} bg-realm/10 rounded px-1 py-0.5`}
                          {...props}
                        >
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-lg px-4 py-3 bg-cream text-realm">
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-2">
                Agora
              </p>

              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-realm/40 animate-pulse" />

                <span
                  className="w-1.5 h-1.5 rounded-full bg-realm/40 animate-pulse"
                  style={{
                    animationDelay: '150ms',
                  }}
                />

                <span
                  className="w-1.5 h-1.5 rounded-full bg-realm/40 animate-pulse"
                  style={{
                    animationDelay: '300ms',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          onKeyDown={handleKeyDown}
          disabled={busy}
          rows={1}
          placeholder="Ask a question..."
          aria-label="Ask the tutor a question"
          className="flex-1 resize-none bg-slatemid/30 border border-slatemid rounded px-3 py-2.5 text-sm text-cream placeholder:text-cream/30 outline-none focus:border-familiar disabled:opacity-50 transition-colors"
        />

        <button
          onClick={() => void ask()}
          disabled={busy || !query.trim()}
          className="px-5 py-2.5 bg-exploring text-realm rounded text-sm font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      <p className="text-[10px] font-mono text-cream/20 mt-2">
        Enter to ask · Shift+Enter for a new line
      </p>
    </div>
  );
}
