import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

/**
 * Supabase Client Initialization
 * Initializes the client using the public anonymous key.
 * Service keys must NEVER be exposed in the frontend client.
 */

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (!isSupabaseConfigured()) {
    if (env.isDevelopment) {
      console.info(
        '[MarketTwin] Supabase credentials not fully configured. Using mock/development mode for Phase 1.'
      );
    }
    return null;
  }

  try {
    supabaseInstance = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseInstance;
  } catch (error) {
    console.error('[MarketTwin] Error initializing Supabase client:', error);
    return null;
  }
};

export const supabase = getSupabaseClient();
