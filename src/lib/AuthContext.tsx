/**
 * AuthContext — session + profile state.
 *
 * Bootstraps from the persisted Supabase session, keeps the profile in sync,
 * and exposes `signInWithPassword`, `signOut`, and refresh helpers.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'customer' | 'admin' | 'dev' | 'tester' | 'consultant' | string | null;
  avatar_url: string | null;
  title: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isFounder: boolean;
  loading: boolean;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const FOUNDER_IDS = new Set<string>([
  '3f178841-4ea5-476a-b67e-6a1fc9fe9284', // Ryan March
  // Mike's UID gets added here once known.
]);

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  // ------------------------------------------------------------------
  // Fetch + cache profile
  // ------------------------------------------------------------------
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, avatar_url, title')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (mounted.current) setProfile((data as Profile) ?? null);
    } catch (err) {
      console.warn('[auth] fetchProfile failed:', err);
      if (mounted.current) setProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await fetchProfile(session.user.id);
  }, [fetchProfile, session?.user.id]);

  // ------------------------------------------------------------------
  // Session bootstrap + auth state listener
  // ------------------------------------------------------------------
  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted.current) return;
        setSession(data.session ?? null);
        if (data.session?.user.id) await fetchProfile(data.session.user.id);
      } catch (err) {
        console.warn('[auth] initial getSession failed:', err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted.current) return;
        setSession(newSession);
        if (newSession?.user.id) {
          fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted.current = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ------------------------------------------------------------------
  // App foreground → refresh session. Keeps token fresh after background.
  // ------------------------------------------------------------------
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) return { error: error.message };
        return { error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sign-in failed';
        return { error: msg };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[auth] signOut failed:', err);
    } finally {
      setSession(null);
      setProfile(null);
    }
  }, []);

  // ------------------------------------------------------------------
  // Derived flags
  // ------------------------------------------------------------------
  const isAdmin = !!profile && (profile.role === 'admin' || profile.role === 'dev');
  const isFounder = !!profile && FOUNDER_IDS.has(profile.id);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin,
      isFounder,
      loading,
      signInWithPassword,
      signOut,
      refreshProfile,
    }),
    [session, profile, isAdmin, isFounder, loading, signInWithPassword, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
