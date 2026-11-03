import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

export type AppRole = 'customer' | 'merchant' | 'admin';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpCustomer: (payload: {
    email: string;
    password: string;
    fullName: string;
    accountType: string;
  }) => Promise<{ error: string | null }>;
  signUpMerchant: (payload: {
    email: string;
    password: string;
    businessName: string;
    ownerName: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const roleFromUser = (user: User | null): AppRole | null => {
  const role = (user?.user_metadata?.role as string) ?? null;
  if (role === 'customer' || role === 'merchant' || role === 'admin') return role;
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRole = async () => {
    if (!supabase || !user) {
      setRole(roleFromUser(user));
      return;
    }
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const dbRole = data?.role as string | undefined;
    if (dbRole === 'customer' || dbRole === 'merchant' || dbRole === 'admin') {
      setRole(dbRole);
    } else {
      setRole(roleFromUser(user));
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setRole(roleFromUser(data.session?.user ?? null));
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setRole(roleFromUser(newSession?.user ?? null));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUpCustomer = async (payload: {
    email: string;
    password: string;
    fullName: string;
    accountType: string;
  }) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.fullName,
          role: 'customer',
          account_type: payload.accountType,
        },
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });
    return { error: error?.message ?? null };
  };

  const signUpMerchant = async (payload: {
    email: string;
    password: string;
    businessName: string;
    ownerName: string;
  }) => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.ownerName,
          role: 'merchant',
          company: payload.businessName,
        },
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });
    return { error: error?.message ?? null };
  };

  const signOutFn = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        loading,
        signIn,
        signUpCustomer,
        signUpMerchant,
        signOut: signOutFn,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};