import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { Video, Settings, Home, LogOut, Calendar, BarChart3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';

export default function Layout({ children, currentPageName }) {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const handleLogout = () => {
    base44.auth.logout();
  };

  const navItems = [
    { name: 'Dashboard', icon: Home, page: 'Dashboard' },
    { name: 'Content Calendar', icon: Calendar, page: 'ContentCalendar' },
    { name: 'Analytics', icon: BarChart3, page: 'TikTokAnalytics' },
    { name: 'Integrations', icon: Settings, page: 'Integrations' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Top Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
                <div className="p-2 bg-slate-900 rounded-lg">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">FacelessForge</span>
              </Link>
              
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPageName === item.page;
                  
                  return (
                    <Link key={item.page} to={createPageUrl(item.page)}>
                      <button
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                          isActive
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </button>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user && (
                <>
                  <div className="hidden sm:block text-sm text-slate-600">
                    {user.email}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t bg-white/50 backdrop-blur-sm mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center text-sm text-slate-600">
            <p>© 2024 FacelessForge. AI-powered video generation platform.</p>
          </div>
        </div>
      </footer>

      <style>{`
        :root {
          --background: 0 0% 100%;
          --foreground: 222.2 84% 4.9%;
          --card: 0 0% 100%;
          --card-foreground: 222.2 84% 4.9%;
          --popover: 0 0% 100%;
          --popover-foreground: 222.2 84% 4.9%;
          --primary: 222.2 47.4% 11.2%;
          --primary-foreground: 210 40% 98%;
          --secondary: 210 40% 96.1%;
          --secondary-foreground: 222.2 47.4% 11.2%;
          --muted: 210 40% 96.1%;
          --muted-foreground: 215.4 16.3% 46.9%;
          --accent: 210 40% 96.1%;
          --accent-foreground: 222.2 47.4% 11.2%;
          --destructive: 0 84.2% 60.2%;
          --destructive-foreground: 210 40% 98%;
          --border: 214.3 31.8% 91.4%;
          --input: 214.3 31.8% 91.4%;
          --ring: 222.2 84% 4.9%;
          --radius: 0.5rem;
        }
      `}</style>
    </div>
  );
}