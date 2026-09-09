import React, { useState, useEffect } from 'react';
import { api, WS_BASE } from '../../api';
import type { FrictionAlert } from '../../types';

interface TeacherDashboardProps {
  courseId: string;
  currentPackId: string;
}

export function TeacherDashboard({ courseId, currentPackId }: TeacherDashboardProps) {
  const [alerts, setAlerts] = useState<FrictionAlert[]>([]);
  const [activePack, setActivePack] = useState<string>(currentPackId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  useEffect(() => {
    api.getAlerts(courseId).then(setAlerts).catch(console.error);

    const ws = new WebSocket(`${WS_BASE}?course_id=${courseId}&role=Teacher`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'friction_alert') {
          setAlerts((prev) => [msg.payload as FrictionAlert, ...prev]);
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };
    return () => ws.close();
  }, [courseId]);

  const handleCurriculumSwitch = async (packId: string) => {
    setActivePack(packId);
    await api.setCourseCurriculum(courseId, packId);
    window.location.reload();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    try {
      await api.uploadDocument(courseId, selectedFile);
      setSelectedFile(null);
      alert('Document ingested successfully into vector store.');
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    await api.resolveAlert(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  return (
    <main className="max-w-container-max mx-auto px-4 md:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">Telemetry Stream Active</span>
          </div>
          <h1 className="text-2xl font-bold text-on-surface">Instructor Command Center</h1>
          <p className="text-sm text-on-surface-variant">Real-time friction tracking and syllabus RAG injection</p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="curriculum-select" className="text-xs font-semibold text-on-surface-variant">Class Framework:</label>
          <select
            id="curriculum-select"
            value={activePack}
            onChange={(e) => handleCurriculumSwitch(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm font-semibold text-primary outline-none"
          >
            <option value="cambridge-math-stage-9">Cambridge Stage 9 Mathematics</option>
            <option value="cambridge-stage8-english">Cambridge Stage 8 English</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Friction Feed */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-xl">warning</span>
                Live Friction Alerts
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container text-xs font-bold">
                {alerts.length} Pending
              </span>
            </div>

            {alerts.length === 0 ? (
              <p className="text-sm text-outline py-6 text-center">No active student struggle detected. Rhythm is steady.</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <div key={a.id || Math.random().toString()} className="p-4 rounded-xl bg-surface border border-error/30 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-on-surface block">{a.student_name || 'Marcus Chen'}</span>
                      <span className="text-xs text-on-surface-variant">
                        Node: <strong>{a.node_title || 'Algebra'}</strong> • {a.reason?.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-error font-medium block mt-0.5">{a.hint_count} Hints Used</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResolve(a.id)}
                        className="px-3 py-1.5 rounded-xl border border-outline-variant/40 text-xs font-semibold hover:bg-surface-container"
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        onClick={() => alert(`Socratic nudge dispatched to ${a.student_name || 'student'}`)}
                        className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary/90"
                      >
                        Intervene
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: RAG Ingestion */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-on-surface">Ground AI with Course Material</h2>
            <p className="text-xs text-on-surface-variant">
              Upload custom lecture notes, assignment sheets, or rubrics (.pdf, .docx, .md). The Socratic AI will cite and scaffold directly from your files.
            </p>

            <form onSubmit={handleUpload} className="space-y-3">
              <input
                type="file"
                accept=".pdf,.docx,.md,.txt"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-outline file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-fixed file:text-primary hover:file:bg-primary-fixed/80"
              />
              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className="w-full py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {uploading ? 'Embedding into Vector Store...' : 'Ingest Document'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}