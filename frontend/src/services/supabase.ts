import { getSupabaseClient } from '../config/supabaseClient';

export const supabase = getSupabaseClient();

export const isSupabaseReady = (): boolean => supabase !== null;