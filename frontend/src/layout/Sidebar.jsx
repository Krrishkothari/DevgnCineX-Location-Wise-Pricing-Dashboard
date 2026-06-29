import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Tags, 
  MapPin, 
  Network, 
  Settings, 
  Bell, 
  MonitorSmartphone 
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/competitors', icon: Tags, label: 'Competitor Pricing' },
  { path: '/theatres', icon: MapPin, label: 'Theatre Management' },
  { path: '/sources', icon: Network, label: 'Source Configurations' },
  { path: '/operations', icon: Settings, label: 'Operations' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[72px] bg-op-sidebar border-r border-op-border flex flex-col items-center py-6 hidden md:flex">
      {/* Logo */}
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-op-accent text-white font-bold tracking-tight shadow-[0_0_15px_rgba(109,93,246,0.3)]">
        OP
      </div>

      {/* Navigation Icons */}
      <nav className="flex flex-1 flex-col gap-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={item.label}
            className={({ isActive }) =>
              `group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-op-accent/10 text-op-accent shadow-[inset_0_0_10px_rgba(109,93,246,0.2)]' 
                  : 'text-op-muted hover:bg-op-card hover:text-op-textMain'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} className={isActive ? 'drop-shadow-[0_0_5px_rgba(109,93,246,0.8)]' : ''} />
                {isActive && (
                  <div className="absolute -right-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-op-accent" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Device Icon */}
      <div className="mt-auto pt-4 text-op-muted hover:text-op-textMain transition-colors cursor-pointer">
        <MonitorSmartphone size={20} />
      </div>
    </aside>
  );
}
