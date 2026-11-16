import type {
  Course,
  DocumentIngestionResult,
  DocumentRow,
  FrictionAlert,
  HeatmapCell,
  KnowledgeNode,
  LiveState,
  SessionContext,
  StartSessionResponse,
  TurnResponse,
} from './types';

const BASE = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

export const WS_BASE = (
  import.meta.env.VITE_WS_URL ||
  `${BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`
).replace(/\/+$/, '');


export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly code?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export function friendlyErrorMessage(
    error: unknown,
    fallback = 'Something went wrong. Please try again.',
): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 400:
                return 'Some of the information provided is invalid. Please check and try again.';
            case 401:
                return 'Your sign-in session has expired. Please sign in again.';
            case 403:
                return 'You do not have permission to perform this action. Please sign in again if needed.';
            case 404:
                return 'We could not find the requested resource. Please refresh and try again.';
            case 429:
                return 'Too many attempts. Please wait a moment before trying again.';
            case 500:
            case 502:
            case 503:
            case 504:
                return 'Agora is temporarily unavailable. Please try again in a moment.';
            default:
                return error.message || fallback;
        }
    }

    if (
        error instanceof TypeError ||
        (error instanceof Error &&
            /failed to fetch|networkerror|load failed/i.test(error.message))
    ) {
        return 'We couldn’t connect to Agora. Check your internet connection and try again. If the problem continues, the service may be temporarily unavailable.';
    }

    if (error instanceof Error) {
        return error.message || fallback;
    }

    return fallback;
}


// -----------------------------------------------------------------------------
// CSRF Token Management
// -----------------------------------------------------------------------------

let csrfToken: string | null = null;
let csrfRefreshPromise: Promise<string> | null = null;

export function setCsrfToken(token: string | null) {
    csrfToken = token;
    csrfRefreshPromise = null;
}

async function refreshCsrfToken(): Promise<string> {
    // Reuse an existing refresh request if one is already running.
    if (csrfRefreshPromise) {
        return csrfRefreshPromise;
    }

    csrfRefreshPromise = (async () => {
        try {
            const response = await fetch(`${BASE}/api/auth/csrf`, {
                credentials: 'include',
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Your session has expired. Please sign in again.'
                        : 'Could not refresh security token.',
                );
            }

            const data = await response.json() as {
                csrf_token: string;
            };

            csrfToken = data.csrf_token;

            return csrfToken;
        } catch (error) {
            csrfToken = null;
            throw error;
        } finally {
            csrfRefreshPromise = null;
        }
    })();

    return csrfRefreshPromise;
}

// -----------------------------------------------------------------------------
// Centralized API Request Handler
// -----------------------------------------------------------------------------

async function req<T = unknown>(
    path: string,
    opts: RequestInit = {},
): Promise<T> {
    const method = (opts.method ?? 'GET').toUpperCase();
    const headers = new Headers(opts.headers);

    const isFormData = opts.body instanceof FormData;
    const hasBody = opts.body != null;

    // Set JSON Content-Type only when a body exists.
    // FormData must let the browser generate its own multipart boundary.
    if (hasBody && !isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    // Attach CSRF token to state-changing requests.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        if (!csrfToken) {
            await refreshCsrfToken();
        }

        if (!headers.has('X-Agora-CSRF')) {
            headers.set('X-Agora-CSRF', csrfToken!);
        }
    }

    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
    });

    // Handle unsuccessful responses.
    if (!res.ok) {
        const body = await res.text();
        let message = body;

        try {
            const parsed = JSON.parse(body);
            message = parsed.error ?? parsed.message ?? body;
        } catch {
            // Keep plain-text error response.
        }

        throw new Error(
            message || `Request failed (${res.status})`,
        );
    }

    // Handle responses without a body.
    if (res.status === 204 || res.status === 205) {
        return undefined as T;
    }

    return await res.json() as T;
}

// -----------------------------------------------------------------------------
// Public API Requests
// Used for authentication endpoints that do not require an existing CSRF token.
// -----------------------------------------------------------------------------

async function publicPost<T>(
    path: string,
    body: unknown,
): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const raw = await res.text();

    if (!res.ok) {
        let message = raw;

        try {
            const parsed = JSON.parse(raw);
            message = parsed.error ?? parsed.message ?? raw;
        } catch {
            // Preserve plain-text error.
        }

        throw new Error(
            message || `Request failed (${res.status})`,
        );
    }

    if (res.status === 204 || res.status === 205 || !raw) {
        return undefined as T;
    }

    return JSON.parse(raw) as T;
}

// -----------------------------------------------------------------------------
// Authentication Types
// -----------------------------------------------------------------------------

export interface AuthMe {
    id: string;
    display_name: string;
    role: 'Teacher' | 'Student';
    course_roles: Record<string, 'Teacher' | 'Student'>;
    courses: string[];
    email: string | null;
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

export const api = {
    // Authentication
    exchangeLaunchCode: async (code: string): Promise<void> => {
        const data = await publicPost<{
            csrf_token: string;
        }>('/api/session/exchange', { code });

        setCsrfToken(data.csrf_token);
    },

    requestEmailLink: (
        email: string,
    ) =>
        publicPost<{
            ok: boolean;
            message: string;
        }>('/api/auth/email/request', { email }),

    verifyEmailLink: async (token: string): Promise<void> => {
        const data = await publicPost<{
            csrf_token: string;
        }>('/api/auth/email/verify', { token });

        setCsrfToken(data.csrf_token);
    },

    simulateLaunchUrl: (
        role: string,
        name: string,
        course: string,
        class_code: string,
    ) =>
        `${BASE}/api/lti/mock-platform/simulate-launch?${new URLSearchParams({
            role,
            name,
            course,
            class_code,
        })}`,

    me: (): Promise<AuthMe> =>
        req<AuthMe>('/api/auth/me'),

    logout: async (): Promise<void> => {
        await req('/api/auth/logout', {
            method: 'POST',
            body: '{}',
        });

        setCsrfToken(null);
    },

    getDemoContext: async (
        role: 'Student' | 'Teacher' = 'Student',
    ) => {
        const res = await fetch(
            `${BASE}/api/auth/demo?role=${encodeURIComponent(role)}`,
            {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
            },
        );

        const raw = await res.text();

        if (!res.ok) {
            let message = raw;

            try {
                const parsed = JSON.parse(raw);
                message = parsed.error ?? parsed.message ?? raw;
            } catch {
                // Keep original response.
            }

            throw new Error(
                message || `Demo login failed (${res.status})`,
            );
        }

        const data = JSON.parse(raw) as {
            course: Course;
            active_user: SessionContext;
            csrf_token: string;
        };

        setCsrfToken(data.csrf_token);

        return data;
    },

    // getDemoContext: async (
    //     role: 'Student' | 'Teacher' = 'Student',
    // ) => {
    //     const res = await fetch(
    //         `${BASE}/api/auth/demo?role=${encodeURIComponent(role)}`,
    //         {
    //             credentials: 'include',
    //             cache: 'no-store',
    //         },
    //     );
    //
    //     if (!res.ok) {
    //         throw new Error(
    //             'Local demo is only available when the backend is running in development mode.',
    //         );
    //     }
    //
    //     const data = await res.json() as {
    //         course: Course;
    //         active_user: SessionContext;
    //         csrf_token: string;
    //     };
    //
    //     setCsrfToken(data.csrf_token);
    //
    //     return data;
    // },

    // ---------------------------------------------------------------------------
    // Courses and Curriculum
    // ---------------------------------------------------------------------------

    getPacks: () =>
        req('/api/packs'),

    setCourseCurriculum: (
        courseId: string,
        packId: string,
    ) =>
        req(`/api/courses/${courseId}/curriculum`, {
            method: 'PATCH',
            body: JSON.stringify({
                curriculum_pack_id: packId,
            }),
        }),

    // ---------------------------------------------------------------------------
    // Knowledge Map
    // ---------------------------------------------------------------------------

    knowledgeMap: (
        courseId: string,
        _studentId?: string,
        packId?: string,
    ): Promise<KnowledgeNode[]> =>
        req<KnowledgeNode[]>(
            `/api/courses/${courseId}/knowledge-map${
                packId
                    ? `?pack_id=${encodeURIComponent(packId)}`
                    : ''
            }`,
        ),

    getKnowledgeMap: (
        courseId: string,
        studentId?: string,
        packId?: string,
    ) =>
        api.knowledgeMap(courseId, studentId, packId),

    // ---------------------------------------------------------------------------
    // Learning Sessions
    // ---------------------------------------------------------------------------

    startSession: (
        course_id: string, node_id: string,
    ): Promise<StartSessionResponse> =>
        req<StartSessionResponse>('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({
                course_id,
                node_id,
            }),
        }),

    submitTurn: (data: {
        session_id: string;
        studentAttempt: string;
        secondsSpent: number;
    }): Promise<TurnResponse> =>
        req<TurnResponse>(
            `/api/sessions/${data.session_id}/turns`,
            {
                method: 'POST',
                headers: {
                    'Idempotency-Key': crypto.randomUUID(),
                },
                body: JSON.stringify({
                    studentAttempt: data.studentAttempt,
                    secondsSpent: data.secondsSpent,
                }),
            },
        ),

    postTurn: (
        sessionId: string,
        body: {
            studentAttempt: string;
            secondsSpent: number;
        },
    ): Promise<TurnResponse> =>
        api.submitTurn({
            session_id: sessionId,
            studentAttempt: body.studentAttempt,
            secondsSpent: body.secondsSpent,
        }),

    askExploratory: (body: {
        course_id: string;
        node_id: string;
        studentQuery: string }) =>
        req<{
            answer: string;
        }>('/api/exploratory', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    // ---------------------------------------------------------------------------
    // Course Management
    // ---------------------------------------------------------------------------

    course: (
        courseId: string,
    ): Promise<Course> =>
        req<Course>(`/api/courses/${courseId}`),

    updateRules: (
        courseId: string,
        scaffold_rules: object,
    ) =>
        req(`/api/courses/${courseId}/rules`, {
            method: 'PATCH',
            body: JSON.stringify({
                scaffold_rules,
            }),
        }),

    // ---------------------------------------------------------------------------
    // Analytics and Monitoring
    // ---------------------------------------------------------------------------

    heatmap: (
        courseId: string,
    ): Promise<HeatmapCell[]> =>
        req<HeatmapCell[]>(`/api/courses/${courseId}/heatmap`),

    liveStates: (
        courseId: string,
    ): Promise<LiveState[]> =>
        req<LiveState[]>(`/api/courses/${courseId}/live-states`),

    getAlerts: (
        courseId: string,
    ): Promise<FrictionAlert[]> =>
        req<FrictionAlert[]>(`/api/courses/${courseId}/alerts`),

    alerts: (
        courseId: string,
    ): Promise<FrictionAlert[]> =>
        api.getAlerts(courseId),

    resolveAlert: (id: string) =>
        req(`/api/alerts/${id}/resolve`, {
            method: 'POST',
            body: '{}',
        }),

    agsLog: (courseId: string) =>
        req(`/api/courses/${courseId}/ags-log`),

    // ---------------------------------------------------------------------------
    // Document Management
    // ---------------------------------------------------------------------------

    documents: (
        courseId: string,
    ): Promise<DocumentRow[]> =>
        req<DocumentRow[]>(
            `/api/courses/${courseId}/documents`,
        ),

    uploadDocument: (
        courseId: string,
        file: File,
        resource_type = 'notes',
        node_id?: string,
    ): Promise<DocumentIngestionResult> => {
        const form = new FormData();

        form.append('file', file);
        form.append('resource_type', resource_type);

        if (node_id) {
            form.append('node_id', node_id);
        }

        return req<DocumentIngestionResult>(
            `/api/courses/${courseId}/documents`,
            {
                method: 'POST',
                body: form,
            },
        );
    },
};