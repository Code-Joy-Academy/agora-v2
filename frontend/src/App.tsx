import { useEffect, useState } from 'react';
import { api } from './api';
import LaunchGate from './components/LaunchGate';
import KnowledgeRealm from './components/KnowledgeRealm';
import ChatInterface from './components/ChatInterface';
import ExploratoryView from './components/ExploratoryView';
import TeacherDashboard from './components/TeacherDashboard';
import type { KnowledgeNode, SessionUser } from './types';

const STORAGE_KEY = 'agora_session';

type View = 'realm' | 'chat' | 'exploratory';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('realm');
  const [activeNode, setActiveNode] = useState<KnowledgeNode | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('launch');

    if (code) {
      api.exchangeLaunchCode(code).then((u: SessionUser) => {
        setUser(u);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        window.history.replaceState({}, '', window.location.pathname);
        setLoading(false);
      }).catch(() => setLoading(false));
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const exit = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setActiveNode(null);
    setView('realm');
  };

  if (loading) return <div className="min-h-screen bg-realm" />;
  if (!user) return <LaunchGate />;

  return (
    <div className="min-h-screen bg-realm">
      <div className="border-b border-slatemid px-6 py-3 flex items-center justify-between">
        <span className="font-serif text-cream">Agora v2</span>
        <button onClick={exit} className="text-xs font-mono text-cream/40 hover:text-cream">{user.role} · exit</button>
      </div>

      {user.role === 'Teacher' ? (
        <TeacherDashboard user={user} />
      ) : view === 'chat' && activeNode ? (
        <ChatInterface user={user} node={activeNode} onBack={() => setView('realm')} />
      ) : view === 'exploratory' ? (
        <ExploratoryView user={user} onBack={() => setView('realm')} />
      ) : (
        <KnowledgeRealm
          courseId={user.course_id}
          studentId={user.id}
          onPick={(node) => { setActiveNode(node); setView('chat'); }}
          onExploratory={() => setView('exploratory')}
        />
      )}
    </div>
  );
}
