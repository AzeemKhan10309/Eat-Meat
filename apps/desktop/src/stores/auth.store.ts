import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithPin: (pin: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          const { user, tokens } = data.data;
          localStorage.setItem('accessToken', tokens.accessToken);
          localStorage.setItem('refreshToken', tokens.refreshToken);
          set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (err: unknown) {
          const e = err as { response?: { data?: { message?: string } } };
          set({ error: e.response?.data?.message || 'Login failed', isLoading: false });
          throw err;
        }
      },

      loginWithPin: async (pin) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/pin-login', { pin });
          const { user, tokens } = data.data;
          localStorage.setItem('accessToken', tokens.accessToken);
          localStorage.setItem('refreshToken', tokens.refreshToken);
          set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (err: unknown) {
          const e = err as { response?: { data?: { message?: string } } };
          set({ error: e.response?.data?.message || 'Invalid PIN', isLoading: false });
          throw err;
        }
      },

      logout: () => {
        const { refreshToken } = get();
        if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => {});
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      clearError: () => set({ error: null }),

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me');
          set({ user: data.data });
        } catch {
          get().logout();
        }
      },
    }),
{
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }  )
);
