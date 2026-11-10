/**
 * Application Environment Configuration
 * Validates and exposes frontend environment variables.
 */

interface EnvConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

export const env: EnvConfig = {
  apiBaseUrl: import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE_URL || '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(env.supabaseUrl) &&
    Boolean(env.supabaseAnonKey) &&
    !env.supabaseUrl.includes('placeholder-project-id') &&
    !env.supabaseAnonKey.includes('placeholder-anon-key')
  );
};
