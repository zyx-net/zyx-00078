import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole } from '../../shared/types.js';

interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null })
    }),
    {
      name: 'auth-storage'
    }
  )
);
