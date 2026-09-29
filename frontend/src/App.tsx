import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { TopNavBar } from './components/shared/TopNavBar';
import { StudentJourney } from './components/student/StudentJourney';
import { PracticeRoom } from './components/student/PracticeRoom';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import type {
  Course,
  CurriculumNode,
  SessionContext,
} from './types';

interface DemoContextResponse {
  course: Course;
  student: SessionContext;
  teacher: SessionContext;
}

export function App() {
  const [role, setRole] = useState<'Student' | 'Teacher'>('Student');
  const [activeView, setActiveView] = useState<
    'journey' | 'practice' | 'dashboard'
  >('journey');

  const [course, setCourse] = useState<Course | null>(null);
  const [user, setUser] = useState<SessionContext | null>(null);
  const [nodes, setNodes] = useState<CurriculumNode[]>([]);
  const [selectedNode, setSelectedNode] =
    useState<CurriculumNode | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNodes = useCallback(
    async (courseId: string, studentId: string, packId?: string) => {
      try {
        const nodeList = await api.getKnowledgeMap(
          courseId,
          studentId,
          packId
        );

        setNodes(nodeList);

        if (nodeList.length > 0) {
          setSelectedNode(nodeList[0]);
        } else {
          setSelectedNode(null);
        }
      } catch (err) {
        console.error('Failed to fetch knowledge map:', err);
      }
    },
    []
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const launchCode = urlParams.get('launch');

    const bootstrap = async () => {
      try {
        if (launchCode) {
          // LMS / LTI launch
          const sessionUser = await api.exchangeLaunchCode(launchCode);

          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          /*
           * Get the authoritative course configuration from the backend
           * instead of hard-coding the curriculum pack on the frontend.
           */
          const course = await api.course(sessionUser.course_id);

          setRole(sessionUser.role);
          setUser(sessionUser);
          setCourse(course);

          await loadNodes(
            course.id,
            sessionUser.id,
            course.curriculum_pack_id
          );
        } else {
          // Standalone / demo mode
          const ctx = (await api.getDemoContext()) as unknown as DemoContextResponse;

          setCourse(ctx.course);
          setUser(ctx.student);

          await loadNodes(
            ctx.course.id,
            ctx.student.id,
            ctx.course.curriculum_pack_id
          );
        }
      } catch (err) {
        console.error('Failed to bootstrap Agora:', err);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
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

      const updatedCourse = {
        ...course,
        curriculum_pack_id: packId,
      };

      setCourse(updatedCourse);

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

        <p className="text-xs text-outline">
          Connecting...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans">
      <TopNavBar
        role={role}
        userName={user.display_name}
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

      {role === 'Student' &&
        activeView === 'practice' &&
        selectedNode && (
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