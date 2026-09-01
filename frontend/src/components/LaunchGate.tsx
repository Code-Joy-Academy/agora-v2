import { useState } from 'react';
import { api } from '../api';
import type { Role } from '../types';

export default function LaunchGate() {
  const [name, setName] = useState('');
  const [classCode, setClassCode] = useState('8E-CJA');
  const [course, setCourse] = useState('8E English');
  const [role, setRole] = useState<Role>('Student');

  const launch = () => {
    if (!name.trim()) return;
    window.location.href = api.simulateLaunchUrl(role, name, course, classCode);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-realm px-4">
      <div className="w-full max-w-sm border border-slatemid rounded-lg p-8 bg-slatemid/30">
        <p className="font-mono text-xs text-exploring tracking-widest uppercase mb-1">LTI 1.3 Launch (mock platform)</p>
        <h1 className="font-serif text-2xl text-cream mb-6">Agora v2</h1>

        <label className="block text-xs text-cream/60 mb-1 font-mono">Course</label>
        <input value={course} onChange={(e) => setCourse(e.target.value)}
          className="w-full mb-4 bg-realm border border-slatemid rounded px-3 py-2 text-cream text-sm outline-none focus:border-familiar" />

        <label className="block text-xs text-cream/60 mb-1 font-mono">Class code</label>
        <input value={classCode} onChange={(e) => setClassCode(e.target.value)}
          className="w-full mb-4 bg-realm border border-slatemid rounded px-3 py-2 text-cream text-sm outline-none focus:border-familiar" />

        <label className="block text-xs text-cream/60 mb-1 font-mono">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
          className="w-full mb-4 bg-realm border border-slatemid rounded px-3 py-2 text-cream text-sm outline-none focus:border-familiar" />

        <label className="block text-xs text-cream/60 mb-1 font-mono">I am a</label>
        <div className="flex gap-2 mb-6">
          {(['Student', 'Teacher'] as Role[]).map((r) => (
            <button key={r} onClick={() => setRole(r)}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${role === r ? 'bg-familiar text-realm' : 'bg-realm border border-slatemid text-cream/70'}`}>
              {r}
            </button>
          ))}
        </div>

        <button onClick={launch}
          className="w-full py-2.5 rounded bg-exploring text-realm font-semibold text-sm hover:brightness-110 transition">
          Launch via LTI
        </button>
        <p className="text-[10px] font-mono text-cream/30 mt-3 leading-relaxed">
          This button triggers a real OIDC + LTI 1.3 handshake against a self-hosted mock platform —
          no test-mode shortcut, the same code path a real Canvas/Moodle launch would take.
        </p>
      </div>
    </div>
  );
}
