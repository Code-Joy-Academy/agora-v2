import type {
  Course,
  CurriculumNode,
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

const BASE =
  import.meta.env.VITE_API_URL ??
  'http://localhost:4000';

const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';

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
  exchangeLaunchCode: (code: string): Promise<SessionContext> =>
    req<SessionContext>('/api/session/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  simulateLaunchUrl: (
    role: string,
    name: string,
    course: string,
    class_code: string
  ) =>
    `${BASE}/api/lti/mock-platform/simulate-launch?${new URLSearchParams({
      role,
      name,
      course,
      class_code,
    })}`,

  getDemoContext: (): Promise<SessionContext> =>
    req<SessionContext>('/api/auth/demo'),

  getPacks: () =>
    req('/api/packs'),

  setCourseCurriculum: (courseId: string, packId: string) =>
    req(`/api/courses/${courseId}/curriculum`, {
      method: 'PATCH',
      body: JSON.stringify({
        curriculum_pack_id: packId,
      }),
    }),

  knowledgeMap: (
    courseId: string,
    studentId: string,
    packId?: string
  ): Promise<KnowledgeNode[]> =>
    req<KnowledgeNode[]>(
      `/api/courses/${courseId}/knowledge-map?student_id=${encodeURIComponent(
        studentId
      )}${packId ? `&pack_id=${encodeURIComponent(packId)}` : ''}`
    ),

  getKnowledgeMap: (
    courseId: string,
    studentId: string,
    packId?: string
  ): Promise<KnowledgeNode[]> =>
    req<KnowledgeNode[]>(
      `/api/courses/${courseId}/knowledge-map?student_id=${encodeURIComponent(
        studentId
      )}${packId ? `&pack_id=${encodeURIComponent(packId)}` : ''}`
    ),

  startSession: (
    student_id: string,
    course_id: string,
    node_id: string
  ): Promise<StartSessionResponse> =>
    req<StartSessionResponse>('/api/sessions', {
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
      }
    ),

  postTurn: (
    sessionId: string,
    body: object
  ): Promise<TurnResponse> =>
    req<TurnResponse>(
      `/api/sessions/${sessionId}/turns`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  askExploratory: (
    body: object
  ): Promise<{ answer: string }> =>
    req<{ answer: string }>('/api/exploratory', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  course: (courseId: string): Promise<Course> =>
    req<Course>(`/api/courses/${courseId}`),

  updateRules: (
    courseId: string,
    scaffold_rules: object
  ) =>
    req(`/api/courses/${courseId}/rules`, {
      method: 'PATCH',
      body: JSON.stringify({ scaffold_rules }),
    }),

  heatmap: (
    courseId: string
  ): Promise<HeatmapCell[]> =>
    req<HeatmapCell[]>(
      `/api/courses/${courseId}/heatmap`
    ),

  liveStates: (
    courseId: string
  ): Promise<LiveState[]> =>
    req<LiveState[]>(
      `/api/courses/${courseId}/live-states`
    ),

  getAlerts: (
    courseId: string
  ): Promise<FrictionAlert[]> =>
    req<FrictionAlert[]>(
      `/api/courses/${courseId}/alerts`
    ),

  alerts: (
    courseId: string
  ): Promise<FrictionAlert[]> =>
    req<FrictionAlert[]>(
      `/api/courses/${courseId}/alerts`
    ),

  resolveAlert: (id: string) =>
    req(`/api/alerts/${id}/resolve`, {
      method: 'POST',
    }),

  agsLog: (courseId: string) =>
    req(`/api/courses/${courseId}/ags-log`),

  documents: (
    courseId: string
  ): Promise<DocumentRow[]> =>
    req<DocumentRow[]>(
      `/api/courses/${courseId}/documents`
    ),

  uploadDocument: (
    courseId: string,
    file: File,
    resource_type = 'notes',
    node_id?: string
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
      }
    );
  },
};
