import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const PROFILE_COLUMNS =
  'id, display_name, exam_date, weekly_study_hours, study_days, explanation_style, local_examples, onboarded_at';

async function fetchProfile(userId: string): Promise<{ profile: Profile | null; error: string | null }> {
  const first = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (first.error) return { profile: null, error: first.error.message };
  if (first.data) return { profile: first.data as Profile, error: null };

  // The signup trigger normally creates this row. Recover if it is missing (for example after a dev reset).
  const created = await supabase.from('profiles').insert({ id: userId });
  if (created.error) return { profile: null, error: created.error.message };
  const retry = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  return { profile: (retry.data as Profile | null) ?? null, error: retry.error?.message ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const result = await fetchProfile(userId);
    setProfile(result.profile);
    setProfileError(result.error);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setProfileError(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Deferred: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => void loadProfile(next.user.id), 0);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadProfile(data.session.user.id);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, profile, loading, profileError, refreshProfile, signOut }),
    [session, profile, loading, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
