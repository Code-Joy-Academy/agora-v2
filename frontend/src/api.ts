import type {
  CurriculumNode,
  DocumentRow,
  FrictionAlert,
  HeatmapCell,
  KnowledgeNode,
  LiveState,
  SessionContext,
  TurnResponse,
} from './types';

const BASE =
  import.meta.env.VITE_API_URL ??
  'http://localhost:4000';

async function req<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,

    headers:
      opts.body instanceof FormData
        ? opts.headers
        : {
            'Content-Type': 'application/json',
            ...(opts.headers ?? {}),
          },
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ----------------------------------------------------------
  // Auth & LTI Launch Handshake
  // ----------------------------------------------------------

  exchangeLaunchCode: (
    code: string,
  ): Promise<SessionContext> =>
    req<SessionContext>(
      '/api/session/exchange',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      },
    ),

  simulateLaunchUrl: (
    role: string,
    name: string,
    course: string,
    class_code: string,
  ) =>
    `${BASE}/api/lti/mock-platform/simulate-launch?${new URLSearchParams(
      {
        role,
        name,
        course,
        class_code,
      },
    )}`,

  getDemoContext: (): Promise<SessionContext> =>
    req<SessionContext>('/api/auth/demo'),

  // ----------------------------------------------------------
  // Curriculum Frameworks & Knowledge Realm
  // ----------------------------------------------------------

  getPacks: (): Promise<unknown[]> =>
    req<unknown[]>('/api/packs'),

  setCourseCurriculum: (
    courseId: string,
    packId: string,
  ) =>
    req<unknown>(
      `/api/courses/${courseId}/curriculum`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          curriculum_pack_id: packId,
        }),
      },
    ),

  getKnowledgeMap: (
    courseId: string,
    studentId: string,
    packId?: string,
  ): Promise<CurriculumNode[]> =>
    req<CurriculumNode[]>(
      `/api/courses/${courseId}/knowledge-map?student_id=${studentId}${
        packId
          ? `&pack_id=${packId}`
          : ''
      }`,
    ),

  knowledgeMap: (
    courseId: string,
    studentId: string,
    packId?: string,
  ): Promise<KnowledgeNode[]> =>
    req<KnowledgeNode[]>(
      `/api/courses/${courseId}/knowledge-map?student_id=${studentId}${
        packId
          ? `&pack_id=${packId}`
          : ''
      }`,
    ),

  // ----------------------------------------------------------
  // Socratic Learning & Session Turns
  // ----------------------------------------------------------

  startSession: (
    student_id: string,
    course_id: string,
    node_id: string,
  ): Promise<{
    session_id: string;
    question: string;
  }> =>
    req<{
      session_id: string;
      question: string;
    }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        student_id,
        course_id,
        node_id,
      }),
    }),

  submitTurn: (data: {
    session_id: string;
    student_id: string;
    course_id: string;
    node_id: string;
    studentAttempt: string;
    secondsSpent: number;
  }): Promise<TurnResponse> =>
    req<TurnResponse>(
      `/api/sessions/${data.session_id}/turns`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),

  postTurn: (
    sessionId: string,
    body: {
      student_id: string;
      course_id: string;
      node_id: string;
      question: string;
      studentAttempt: string;
      secondsSpent: number;
    },
  ): Promise<TurnResponse> =>
    req<TurnResponse>(
      `/api/sessions/${sessionId}/turns`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  askExploratory: (body: {
    course_id: string;
    node_id: string | null;
    studentQuery: string;
  }): Promise<{
    answer: string;
  }> =>
    req<{
      answer: string;
    }>('/api/exploratory', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ----------------------------------------------------------
  // Teacher Telemetry & Alerts
  // ----------------------------------------------------------

  course: (
    courseId: string,
  ): Promise<unknown> =>
    req<unknown>(
      `/api/courses/${courseId}`,
    ),

  updateRules: (
    courseId: string,
    scaffold_rules: object,
  ): Promise<unknown> =>
    req<unknown>(
      `/api/courses/${courseId}/rules`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          scaffold_rules,
        }),
      },
    ),

  heatmap: (
    courseId: string,
  ): Promise<HeatmapCell[]> =>
    req<HeatmapCell[]>(
      `/api/courses/${courseId}/heatmap`,
    ),

  liveStates: (
    courseId: string,
  ): Promise<LiveState[]> =>
    req<LiveState[]>(
      `/api/courses/${courseId}/live-states`,
    ),

  getAlerts: (
    courseId: string,
  ): Promise<FrictionAlert[]> =>
    req<FrictionAlert[]>(
      `/api/courses/${courseId}/alerts`,
    ),

  alerts: (
    courseId: string,
  ): Promise<FrictionAlert[]> =>
    req<FrictionAlert[]>(
      `/api/courses/${courseId}/alerts`,
    ),

  resolveAlert: (
    id: string,
  ): Promise<unknown> =>
    req<unknown>(
      `/api/alerts/${id}/resolve`,
      {
        method: 'POST',
      },
    ),

  agsLog: (
    courseId: string,
  ): Promise<unknown> =>
    req<unknown>(
      `/api/courses/${courseId}/ags-log`,
    ),

  // ----------------------------------------------------------
  // Document RAG Ingestion
  // ----------------------------------------------------------

  documents: (
    courseId: string,
  ): Promise<DocumentRow[]> =>
    req<DocumentRow[]>(
      `/api/courses/${courseId}/documents`,
    ),

  uploadDocument: (
    courseId: string,
    file: File,
    resource_type: string = 'notes',
    node_id?: string,
  ): Promise<DocumentRow> => {
    const form = new FormData();

    form.append('file', file);
    form.append(
      'resource_type',
      resource_type,
    );

    if (node_id) {
      form.append('node_id', node_id);
    }

    return req<DocumentRow>(
      `/api/courses/${courseId}/documents`,
      {
        method: 'POST',
        body: form,
      },
    );
  },
};

export const WS_BASE =
  (import.meta.env.VITE_WS_URL ??
    'ws://localhost:4000') + '/ws';