import { useCallback, useEffect, useState } from 'react';
import { api, setCsrfToken, type AuthMe } from './api';

import { AuthScreen } from './components/auth/AuthScreen';
import { TopNavBar } from './components/shared/TopNavBar';
import { StudentJourney } from './components/student/StudentJourney';
import { PracticeRoom } from './components/student/PracticeRoom';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';

import type {
  Course,
  CurriculumNode,
  SessionContext,
} from './types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ActiveUser = SessionContext & {
  email?: string | null;
};

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

export function App() {
  const [course, setCourse] = useState<Course | null>(null);
  const [user, setUser] = useState<ActiveUser | null>(null);

  const [nodes, setNodes] = useState<CurriculumNode[]>([]);
  const [selectedNode, setSelectedNode] =
    useState<CurriculumNode | null>(null);

  const [activeView, setActiveView] = useState<
    'journey' | 'practice' | 'dashboard'
  >('journey');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

// -----------------------------------------------------------------------------
// Knowledge Map
// -----------------------------------------------------------------------------

  const loadNodes = useCallback(
    async (courseId: string, packId?: string) => {
      const nodeList = await api.getKnowledgeMap(
        courseId,
        undefined,
        packId,
      );

      setNodes(nodeList);

      // Preserve the currently selected node if it still exists.
      setSelectedNode((current) => {
        if (current) {
          const existingNode = nodeList.find(
            (node) => node.id === current.id,
          );

          if (existingNode) {
            return existingNode;
          }
        }

        return nodeList[0] ?? null;
      });
    },
    [],
  );

// -----------------------------------------------------------------------------
// Authenticated Application Bootstrap
// -----------------------------------------------------------------------------

  const loadAuthenticatedApp = useCallback(
    async (principal?: AuthMe) => {
      // Use the supplied principal or retrieve the current session.
      const me = principal ?? await api.me();

      // Resolve the user's first available course.
      const courseId = me.courses[0];

      if (!courseId) {
        throw new Error(
          'Your account is not enrolled in an Agora course. Ask your institution administrator for access.',
        );
      }

      // Fetch authoritative course configuration.
      const courseData = await api.course(courseId);

      // Resolve the user's role for this specific course.
      const courseRole = me.course_roles[courseId] ?? me.role;

      const activeUser: ActiveUser = {
        id: me.id,
        display_name: me.display_name,
        role: courseRole,
        course_id: courseId,
        class_code: courseData.title,
        email: me.email,
      };

      setCourse(courseData);
      setUser(activeUser);

      // Set the initial view according to the user's course role.
      setActiveView(
        courseRole === 'Teacher' ? 'dashboard' : 'journey',
      );

      // Only students need the knowledge map.
      if (courseRole === 'Student') {
        await loadNodes(
          courseId,
          courseData.curriculum_pack_id,
        );
      } else {
        setNodes([]);
        setSelectedNode(null);
      }
    },
    [loadNodes],
  );

// -----------------------------------------------------------------------------
// Application Bootstrap
// -----------------------------------------------------------------------------

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams(
        window.location.search,
      );

      const launchCode = params.get('launch');

      if (launchCode) {
        // Exchange the single-use LMS/LTI launch code.
        await api.exchangeLaunchCode(launchCode);

        // Remove the launch code immediately from browser history.
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      } else if (window.location.pathname === '/auth/verify') {
        // Allow the authentication screen to handle email verification.
        setLoading(false);
        return;
      }

      // Load the authenticated principal from the cookie-backed session.
      await loadAuthenticatedApp();

    } catch (err) {
      setUser(null);
      setCourse(null);
      setNodes([]);
      setSelectedNode(null);

      // Authentication failures should display the login screen.
      // Other errors should be shown to the user.
      if (
        err instanceof Error &&
        !/Authentication required|401/i.test(err.message)
      ) {
        setError(err.message);
      }

    } finally {
      setLoading(false);
    }
  }, [loadAuthenticatedApp]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

// -----------------------------------------------------------------------------
// Logout
// -----------------------------------------------------------------------------

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // The session may already have expired.
    }

    // Clear local authentication state.
    setCsrfToken(null);

    setCourse(null);
    setUser(null);
    setNodes([]);
    setSelectedNode(null);

    setActiveView('journey');
    setError('');

    // Return to the application root.
    window.history.replaceState(
      {},
      document.title,
      '/',
    );
  };

// -----------------------------------------------------------------------------
// Curriculum Pack Selection
// -----------------------------------------------------------------------------

  const handleSelectPack = async (packId: string) => {
    if (!course || !user) return;

    try {
      setError('');

      // Persist the selected curriculum pack.
      await api.setCourseCurriculum(
        course.id,
        packId,
      );

      // Update local course state.
      const updatedCourse = {
        ...course,
        curriculum_pack_id: packId,
      };

      setCourse(updatedCourse);

      // Reload the knowledge map for the selected pack.
      await loadNodes(
        course.id,
        packId,
      );

    } catch (err) {
      console.error(
        'Failed to change curriculum pack:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to change curriculum pack.',
      );
    }
  };

// -----------------------------------------------------------------------------
// Node Selection
// -----------------------------------------------------------------------------

  const handleSelectNode = (node: CurriculumNode) => {
    setSelectedNode(node);
    setActiveView('practice');
  };

// -----------------------------------------------------------------------------
// Loading Screen
// -----------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-primary animate-ping" />

          <span className="text-sm text-on-surface-variant">
            Connecting to Agora…
          </span>
        </div>
      </div>
    );
  }

// -----------------------------------------------------------------------------
// Authentication Screen
// -----------------------------------------------------------------------------

  if (!user || !course) {
    return (
      <>
        <AuthScreen
          onAuthenticated={() => {
            void bootstrap();
          }}
        />

        {error && (
          <p
            role="alert"
            className="fixed bottom-4 left-4 right-4 mx-auto max-w-lg rounded-xl bg-error-container p-3 text-sm text-on-error-container"
          >
            {error}
          </p>
        )}
      </>
    );
  }

// -----------------------------------------------------------------------------
// Main Application
// -----------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans">

      {/* Navigation */}
      <TopNavBar
        role={user.role}
        userName={user.display_name}
        courseTitle={course.title}
        activeView={activeView}
        onViewChange={setActiveView}
        onLogout={handleLogout}
      />

      {/* Application Error */}
      {error && (
        <p
          role="alert"
          className="mx-auto mt-3 max-w-4xl rounded-lg bg-error-container p-3 text-xs text-on-error-container"
        >
          {error}
        </p>
      )}

      {/* Student Journey */}
      {user.role === 'Student' &&
        activeView === 'journey' && (
          <StudentJourney
            userName={user.display_name}
            nodes={nodes}
            activePackId={course.curriculum_pack_id}
            onSelectPack={handleSelectPack}
            onSelectNode={handleSelectNode}
          />
        )}

      {/* Student Practice Room */}
      {user.role === 'Student' &&
        activeView === 'practice' &&
        selectedNode && (
          <PracticeRoom
            courseId={course.id}
            studentId={user.id}
            node={selectedNode}
            onExit={() => setActiveView('journey')}
          />
        )}

      {/* Teacher Dashboard */}
      {user.role === 'Teacher' && (
        <TeacherDashboard
          courseId={course.id}
          currentPackId={course.curriculum_pack_id}
        />
      )}

    </div>
  );
}

export default App;