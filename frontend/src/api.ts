const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: opts.body instanceof FormData ? opts.headers : { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  exchangeLaunchCode: (code: string) => req('/api/session/exchange', { method: 'POST', body: JSON.stringify({ code }) }),
  simulateLaunchUrl: (role: string, name: string, course: string, class_code: string) =>
    `${BASE}/api/lti/mock-platform/simulate-launch?${new URLSearchParams({ role, name, course, class_code })}`,

  knowledgeMap: (courseId: string, studentId: string) => req(`/api/courses/${courseId}/knowledge-map?student_id=${studentId}`),
  startSession: (student_id: string, course_id: string, node_id: string) =>
    req('/api/sessions', { method: 'POST', body: JSON.stringify({ student_id, course_id, node_id }) }),
  postTurn: (sessionId: string, body: object) => req(`/api/sessions/${sessionId}/turns`, { method: 'POST', body: JSON.stringify(body) }),
  askExploratory: (body: object) => req('/api/exploratory', { method: 'POST', body: JSON.stringify(body) }),

  course: (courseId: string) => req(`/api/courses/${courseId}`),
  updateRules: (courseId: string, scaffold_rules: object) =>
    req(`/api/courses/${courseId}/rules`, { method: 'PATCH', body: JSON.stringify({ scaffold_rules }) }),
  heatmap: (courseId: string) => req(`/api/courses/${courseId}/heatmap`),
  liveStates: (courseId: string) => req(`/api/courses/${courseId}/live-states`),
  alerts: (courseId: string) => req(`/api/courses/${courseId}/alerts`),
  resolveAlert: (id: string) => req(`/api/alerts/${id}/resolve`, { method: 'POST' }),
  agsLog: (courseId: string) => req(`/api/courses/${courseId}/ags-log`),

  documents: (courseId: string) => req(`/api/courses/${courseId}/documents`),
  uploadDocument: (courseId: string, file: File, resource_type: string, node_id?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('resource_type', resource_type);
    if (node_id) form.append('node_id', node_id);
    return req(`/api/courses/${courseId}/documents`, { method: 'POST', body: form });
  },
};

export const WS_BASE = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000') + '/ws';
