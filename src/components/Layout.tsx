import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileDown,
  Layers,
  LogOut,
  User,
  Menu,
  X,
  Settings
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { USER_ROLE_LABELS } from '../../shared/types';
import { logout as apiLogout } from '@/utils/api';

const menuItems = [
  {
    path: '/cases',
    label: '案件列表',
    icon: LayoutDashboard,
    roles: ['leader', 'merchant', 'cs']
  },
  {
    path: '/cases/new',
    label: '新建申请',
    icon: PlusCircle,
    roles: ['leader']
  },
  {
    path: '/export',
    label: '退款导出',
    icon: FileDown,
    roles: ['cs']
  },
  {
    path: '/batch',
    label: '批量操作历史',
    icon: Layers,
    roles: ['cs']
  },
  {
    path: '/rules',
    label: '规则配置',
    icon: Settings,
    roles: ['cs']
  }
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await apiLogout();
    logout();
    navigate('/login');
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));
  const sidebarClass = sidebarOpen ? 'w-64' : 'w-20';
  const currentPageLabel = visibleMenuItems.find(m => location.pathname.startsWith(m.path))?.label || '案件管理';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className={`${sidebarClass} bg-gradient-to-b from-blue-900 to-indigo-900 text-white transition-all duration-300 flex flex-col fixed lg:relative z-40`}>
        <div className="p-4 flex items-center justify-between border-b border-blue-700/30">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="font-bold text-lg">售后仲裁</h1>
                <p className="text-xs text-blue-300">社区团购管理</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const btnClass = isActive
              ? 'bg-white/20 text-white shadow-lg'
              : 'text-blue-200 hover:bg-white/10 hover:text-white';
            const iconClass = isActive ? 'text-white' : 'text-blue-300 group-hover:text-white';
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${btnClass}`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${iconClass}`} />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-blue-700/30">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl mb-2">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.name}</p>
                <p className="text-xs text-blue-300">{USER_ROLE_LABELS[user.role]}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-blue-200 hover:bg-red-500/20 hover:text-red-300 rounded-xl transition-all duration-200"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">退出登录</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-h-screen">
        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 backdrop-blur-sm bg-white/90">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{currentPageLabel}</h2>
              <p className="text-sm text-gray-500">
                欢迎回来，{user.name}（{USER_ROLE_LABELS[user.role]}）
              </p>
            </div>
          </div>
        </header>

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
