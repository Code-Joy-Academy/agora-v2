
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, friendlyErrorMessage } from '../../api';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const isVerifyRoute = window.location.pathname === '/auth/verify';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoRole, setDemoRole] = useState<'Student' | 'Teacher'>('Student');

  useEffect(() => {
    if (isVerifyRoute && !token) {
      setError(
          'This sign-in link is missing its token. Please request a new one.',
      );
    }
  }, [isVerifyRoute, token]);

  const verify = async () => {
    if (!token || busy) return;

    setBusy(true);
    setError('');

    try {
      await api.verifyEmailLink(token);
      window.history.replaceState({}, document.title, '/');
      onAuthenticated();
    } catch (error) {
      setError(
          friendlyErrorMessage(
              error,
              'We couldn’t verify your sign-in link. Please request a new one.',
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (busy) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setBusy(true);
    setError('');
    setSent(false);

    try {
      await api.requestEmailLink(normalizedEmail);
      setSent(true);
    } catch (error) {
      setError(
          friendlyErrorMessage(
              error,
              'We couldn’t send your sign-in link. Please try again.',
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    if (busy) return;

    setBusy(true);
    setError('');

    try {
      await api.getDemoContext(demoRole);
      onAuthenticated();
    } catch (error) {
      setError(
          friendlyErrorMessage(
              error,
              'Demo sign-in couldn’t be completed. Please try again.',
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
        <section className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">
              auto_stories
            </span>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-on-surface">
                Agora
              </h1>
              <p className="text-xs text-on-surface-variant">
                Your learning space
              </p>
            </div>
          </div>

          {isVerifyRoute ? (
              <>
                <h2 className="text-lg font-bold text-on-surface mb-2">
                  Confirm sign in
                </h2>

                <p className="text-sm text-on-surface-variant mb-5">
                  Your one-time sign-in link is ready. Continue to Agora to
                  securely complete your sign-in.
                </p>

                <button
                    type="button"
                    onClick={verify}
                    disabled={busy || !token}
                    className="w-full rounded-xl bg-primary text-on-primary py-3 text-sm font-bold disabled:opacity-50"
                >
                  {busy ? 'Verifying your sign-in link…' : 'Continue to Agora'}
                </button>

                {!token && (
                    <button
                        type="button"
                        onClick={() => {
                          window.location.href = '/';
                        }}
                        className="w-full mt-3 rounded-xl border border-outline-variant py-3 text-sm font-semibold text-primary"
                    >
                      Return to sign in
                    </button>
                )}
              </>
          ) : (
              <>
                <h2 className="text-lg font-bold text-on-surface mb-2">
                  Sign in to Agora
                </h2>

                <p className="text-sm text-on-surface-variant mb-5">
                  Enter your institution-registered email. We'll send you
                  a secure, one-time sign-in link.
                </p>

                {sent ? (
                    <div className="rounded-xl bg-surface-container p-4">
                      <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary">
                    mark_email_read
                  </span>

                        <h3 className="font-semibold text-sm text-on-surface">
                          Check your inbox
                        </h3>
                      </div>

                      <p className="text-sm text-on-surface-variant">
                        If your account is eligible, a sign-in link has been
                        sent to your email. Check your inbox and spam folder.
                      </p>

                      <button
                          type="button"
                          onClick={() => setSent(false)}
                          className="mt-4 text-sm font-semibold text-primary"
                      >
                        Use a different email
                      </button>
                    </div>
                ) : (
                    <form onSubmit={requestLink} className="space-y-3">
                      <label
                          htmlFor="email"
                          className="block text-xs font-semibold text-on-surface-variant"
                      >
                        Email address
                      </label>

                      <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          required
                          disabled={busy}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="w-full rounded-xl border border-outline-variant bg-background px-3 py-3 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-60"
                          placeholder="you@school.edu"
                      />

                      <button
                          disabled={busy}
                          type="submit"
                          className="w-full rounded-xl bg-primary text-on-primary py-3 text-sm font-bold disabled:opacity-50"
                      >
                        {busy ? 'Sending your link…' : 'Email me a sign-in link'}
                      </button>
                    </form>
                )}

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px bg-outline-variant/50 flex-1" />
                  <span className="text-[10px] uppercase tracking-wider text-outline">
                or
              </span>
                  <div className="h-px bg-outline-variant/50 flex-1" />
                </div>

                <p className="text-xs text-on-surface-variant">
                  Using an LMS? Open Agora from your course in Canvas,
                  Moodle, or another configured LTI 1.3 platform.
                </p>

                {import.meta.env.DEV && (
                    <div className="mt-5 border-t border-outline-variant/30 pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-2">
                        Local development only
                      </p>

                      <div className="flex gap-2">
                        <select
                            value={demoRole}
                            disabled={busy}
                            onChange={(event) =>
                                setDemoRole(
                                    event.target.value as 'Student' | 'Teacher',
                                )
                            }
                            className="flex-1 rounded-lg border border-outline-variant bg-background px-2 text-sm text-on-surface"
                        >
                          <option value="Student">Student demo</option>
                          <option value="Teacher">Teacher demo</option>
                        </select>

                        <button
                            type="button"
                            onClick={demo}
                            disabled={busy}
                            className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
                        >
                          {busy ? 'Connecting…' : 'Use demo'}
                        </button>
                      </div>
                    </div>
                )}
              </>
          )}

          {error && (
              <div
                  role="alert"
                  aria-live="polite"
                  className="mt-4 flex gap-2 rounded-lg bg-error-container p-3 text-xs text-on-error-container"
              >
            <span className="material-symbols-outlined text-base">
              error
            </span>

                <p>{error}</p>
              </div>
          )}
        </section>
      </main>
  );
}
