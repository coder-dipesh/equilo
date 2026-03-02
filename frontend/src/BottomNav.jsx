import { NavLink } from 'react-router-dom';
import { Home, Building2, Activity } from 'lucide-react';

/**
 * Mobile-only bottom navigation. Shown on small screens for thumb-friendly access
 * to Home, Places, and Activity. Hidden on md+ where top nav is used.
 */
export default function BottomNav() {
  const linkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-2 px-1 rounded-lg text-xs font-medium transition-colors no-underline touch-manipulation ${
      isActive ? 'text-primary' : 'text-text-muted hover:text-text-primary active:opacity-80'
    }`;

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-5xl mx-auto flex items-stretch justify-around">
        <NavLink to="/" end className={linkClass} title="Home">
          <Home className="w-6 h-6 shrink-0" aria-hidden />
          <span>Home</span>
        </NavLink>
        <NavLink to="/places" className={linkClass} title="Places">
          <Building2 className="w-6 h-6 shrink-0" aria-hidden />
          <span>Places</span>
        </NavLink>
        <NavLink to="/activity" className={linkClass} title="Activity">
          <Activity className="w-6 h-6 shrink-0" aria-hidden />
          <span>Activity</span>
        </NavLink>
      </div>
    </nav>
  );
}
