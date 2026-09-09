interface TopNavBarProps {
    role: 'Student' | 'Teacher';
    userName: string;
    courseTitle: string;
    activeView: 'journey' | 'practice' | 'dashboard';
    onViewChange: (v: 'journey' | 'practice' | 'dashboard') => void;
    onRoleSwitch: () => void;
  }
  
  export function TopNavBar({
    role,
    userName,
    courseTitle,
    activeView,
    onViewChange,
    onRoleSwitch,
  }: TopNavBarProps) {
    return (
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant/30 shadow-xs">
        <div className="max-w-container-max mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-xl">auto_stories</span>
              </div>
              <span className="text-xl font-bold text-primary tracking-tight">Agora</span>
            </div>
  
            <nav className="hidden md:flex items-center gap-6">
              {role === 'Student' ? (
                <>
                  <button
                    type="button"
                    onClick={() => onViewChange('journey')}
                    className={`text-sm font-semibold pb-1 border-b-2 flex items-center gap-1.5 transition-colors ${
                      activeView === 'journey' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">map</span>
                    My Journey
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewChange('practice')}
                    className={`text-sm font-semibold pb-1 border-b-2 flex items-center gap-1.5 transition-colors ${
                      activeView === 'practice' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">chat_bubble</span>
                    Practice Room
                  </button>
                </>
              ) : (
                <span className="text-sm font-bold text-primary border-b-2 border-primary pb-1">
                  Teacher Telemetry
                </span>
              )}
            </nav>
          </div>
  
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-xs font-semibold text-on-surface-variant border border-outline-variant/30">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span>{courseTitle}</span>
            </div>
  
            <button
              type="button"
              onClick={onRoleSwitch}
              className="px-3 py-1.5 rounded-xl bg-surface-container-low text-xs font-bold text-primary border border-outline-variant/30 hover:bg-surface-container transition-all"
            >
              Switch to {role === 'Student' ? 'Teacher' : 'Student'}
            </button>
  
            <div className="flex items-center gap-2 pl-2 border-l border-outline-variant/30">
              <div className="w-8 h-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-xs">
                {userName.charAt(0)}
              </div>
              <span className="hidden lg:block text-xs font-bold text-on-surface">{userName}</span>
            </div>
          </div>
        </div>
      </header>
    );
  }