import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { TopNavBar } from './components/shared/TopNavBar';
import { StudentJourney } from './components/student/StudentJourney';
import { PracticeRoom } from './components/student/PracticeRoom';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import type { CurriculumNode, SessionContext } from './types';

interface CourseState {
  id: string;
  title: string;
  curriculum_pack_id: string;
}

interface DemoContextResponse {
  course: CourseState;
  student: SessionContext;
  teacher: SessionContext;
}

export function App() {
  const [role, setRole] = useState<'Student' | 'Teacher'>('Student');
  const [activeView, setActiveView] = useState<'journey' | 'practice' | 'dashboard'>('journey');
  const [course, setCourse] = useState<CourseState | null>(null);
  const [user, setUser] = useState<SessionContext | null>(null);
  const [nodes, setNodes] = useState<CurriculumNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<CurriculumNode | null>(null);
  const [loading, setLoading] = useState(true);

  // Load nodes for a specific pack or the current course pack
  const loadNodes = useCallback(async (courseId: string, studentId: string, packId?: string) => {
    try {
      const nodeList = await api.getKnowledgeMap(courseId, studentId, packId);
      setNodes(nodeList);
      if (nodeList.length > 0) {
        setSelectedNode(nodeList[0]);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge map:', err);
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const launchCode = urlParams.get('launch');

    if (launchCode) {
      // 1. LMS Launch Path
      api.exchangeLaunchCode(launchCode)
        .then(async (sessionUser) => {
          window.history.replaceState({}, document.title, window.location.pathname);
          const initialCourse: CourseState = {
            id: sessionUser.course_id,
            title: sessionUser.class_code,
            curriculum_pack_id: 'cambridge-math-stage-9',
          };
          setRole(sessionUser.role);
          setUser(sessionUser);
          setCourse(initialCourse);
          await loadNodes(initialCourse.id, sessionUser.id, initialCourse.curriculum_pack_id);
          setLoading(false);
        })
        .catch((err) => {
          console.error('LTI launch exchange error:', err);
          setLoading(false);
        });
    } else {
      // 2. Standalone / Demo Path
      fetch('http://localhost:4000/api/auth/demo')
        .then((res) => {
          if (!res.ok) throw new Error('Demo endpoint unavailable');
          return res.json() as Promise<DemoContextResponse>;
        })
        .then(async (ctx) => {
          setCourse(ctx.course);
          setUser(ctx.student);
          await loadNodes(ctx.course.id, ctx.student.id, ctx.course.curriculum_pack_id);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to bootstrap demo context:', err);
          setLoading(false);
        });
    }
  }, [loadNodes]);

  const handleRoleSwitch = () => {
    if (role === 'Student') {
      setRole('Teacher');
      setActiveView('dashboard');
    } else {
      setRole('Student');
      setActiveView('journey');
    }
  };

  const handleSelectPack = async (packId: string) => {
    if (!course || !user) return;
    try {
      await api.setCourseCurriculum(course.id, packId);
      setCourse((prev) => (prev ? { ...prev, curriculum_pack_id: packId } : null));
      await loadNodes(course.id, user.id, packId);
    } catch (err) {
      console.error('Failed to change curriculum pack:', err);
    }
  };

  const handleSelectNode = (node: CurriculumNode) => {
    setSelectedNode(node);
    setActiveView('practice');
  };

  if (loading || !course || !user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-on-surface">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full bg-primary animate-ping" />
          <span className="text-sm font-semibold text-on-surface-variant">
            Bootstrapping Agora Learning Realm...
          </span>
        </div>
        <p className="text-xs text-outline">Connecting to curriculum service on :4000</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans">
      <TopNavBar
        role={role}
        userName={role === 'Student' ? user.display_name : 'Dr. Jenkins'}
        courseTitle={course.title}
        activeView={activeView}
        onViewChange={setActiveView}
        onRoleSwitch={handleRoleSwitch}
      />

      {role === 'Student' && activeView === 'journey' && (
        <StudentJourney
          userName={user.display_name}
          nodes={nodes}
          activePackId={course.curriculum_pack_id}
          onSelectPack={handleSelectPack}
          onSelectNode={handleSelectNode}
        />
      )}

      {role === 'Student' && activeView === 'practice' && selectedNode && (
        <PracticeRoom
          courseId={course.id}
          studentId={user.id}
          node={selectedNode}
          onExit={() => setActiveView('journey')}
        />
      )}

      {role === 'Teacher' && (
        <TeacherDashboard
          courseId={course.id}
          currentPackId={course.curriculum_pack_id}
        />
      )}
    </div>
  );
}

export default App;