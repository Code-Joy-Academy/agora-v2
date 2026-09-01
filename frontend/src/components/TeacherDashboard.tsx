import { useEffect, useRef, useState } from 'react';
import { api, WS_BASE } from '../api';
import Heatmap from './Heatmap';
import IngestionManager from './IngestionManager';
import PedagogySlider from './PedagogySlider';
import type { FrictionAlert, HeatmapCell, LiveState, SessionUser } from '../types';

const REASON_LABEL: Record<string, string> = {
  hint_cap_exceeded: 'Ran out of hints', repeated_misconception: 'Repeated misconception',
};

export default function TeacherDashboard({ user }: { user: SessionUser }) {
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [live, setLive] = useState<LiveState[]>([]);
  const [alerts, setAlerts] = useState<FrictionAlert[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = async () => {
    setHeatmap(await api.heatmap(user.course_id));
    setLive(await api.liveStates(user.course_id));
    setAlerts(await api.alerts(user.course_id));
  };

  useEffect(() => {
    refresh();
    const ws = new WebSocket(`${WS_BASE}?course_id=${user.course_id}&role=Teacher`);
    ws.onmessage = () => refresh();
    wsRef.current = ws;
    return () => ws.close();
  }, [user.course_id]);

  const sendOverride = (student_id: string) => {
    const message = overrideDraft[student_id];
    if (!message?.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: 'teacher_override', student_id, message }));
    setOverrideDraft((d) => ({ ...d, [student_id]: '' }));
  };

  const resolve = async (id: string) => {
    await api.resolveAlert(id);
    setAlerts((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-8">
        <div>
          <p className="font-mono text-xs text-exploring uppercase tracking-widest mb-1">Class {user.class_code}</p>
          <h1 className="font-serif text-xl text-cream mb-4">{user.display_name}</h1>
        </div>

        <div>
          <p className="text-xs font-mono text-cream/50 uppercase tracking-widest mb-2">Concept mastery heatmap</p>
          <Heatmap cells={heatmap} />
        </div>

        <div>
          <p className="text-xs font-mono text-cream/50 uppercase tracking-widest mb-2">Live activity</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-cream/40 font-mono text-xs border-b border-slatemid">
                <th className="pb-2 font-normal">Student</th>
                <th className="pb-2 font-normal">Topic</th>
                <th className="pb-2 font-normal">Mastery</th>
                <th className="pb-2 font-normal">Hints</th>
                <th className="pb-2 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {live.map((s) => (
                <tr key={`${s.student_id}-${s.node_id}`} className="border-b border-slatemid/50">
                  <td className="py-3 text-cream font-serif">{s.display_name}</td>
                  <td className="py-3 text-cream/70 text-xs">{s.node_title}</td>
                  <td className="py-3">
                    <div className="w-20 h-1.5 bg-slatemid rounded-full overflow-hidden">
                      <div className="h-full bg-familiar" style={{ width: `${s.p_mastery * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-3 font-mono text-xs" style={{ color: s.hint_count >= 3 ? '#C4453D' : undefined }}>{s.hint_count}/3</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <input value={overrideDraft[s.student_id] ?? ''} placeholder="Override note…"
                        onChange={(e) => setOverrideDraft((d) => ({ ...d, [s.student_id]: e.target.value }))}
                        className="bg-realm border border-slatemid rounded px-2 py-1 text-xs text-cream w-28 outline-none focus:border-familiar" />
                      <button onClick={() => sendOverride(s.student_id)} className="px-2 py-1 bg-exploring text-realm rounded text-xs font-semibold">Send</button>
                    </div>
                  </td>
                </tr>
              ))}
              {live.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-cream/30 text-xs font-mono">No active sessions yet</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <IngestionManager courseId={user.course_id} />
          <PedagogySlider courseId={user.course_id} />
        </div>
      </div>

      <div>
        <p className="font-mono text-xs text-crimson uppercase tracking-widest mb-3">Stuck students</p>
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="border border-crimson/40 bg-crimson/10 rounded-lg p-3">
              <p className="text-sm text-cream font-serif">{a.display_name}</p>
              <p className="text-xs font-mono text-cream/50 mb-2">{a.node_title} · {REASON_LABEL[a.reason] ?? a.reason}</p>
              <button onClick={() => resolve(a.id)} className="text-xs font-mono text-familiar hover:underline">Mark resolved</button>
            </div>
          ))}
          {alerts.length === 0 && <p className="text-xs font-mono text-cream/30">No open alerts</p>}
        </div>
      </div>
    </div>
  );
}
