-- 015_fix_is_admin_rls_recursion.sql
--
-- Problem:
--   public.is_admin() reads public.profiles. The RLS policies on public.profiles
--   call public.is_admin() again. When a request is evaluated as anon or
--   authenticated (i.e. RLS is active), Postgres recurses until it raises:
--       ERROR 54001: stack depth limit exceeded
--   which PostgREST exposes as HTTP 500 (e.g. GET /rest/v1/orders).
--
-- Fix:
--   Make is_admin() SECURITY DEFINER so it executes with the privileges of its
--   owner (the table owner bypasses RLS on public.profiles). This breaks the
--   recursion without weakening the authorisation check: the function still
--   only returns TRUE when auth.uid() belongs to an admin profile.
--
--   A fixed search_path is required for SECURITY DEFINER functions to prevent
--   search_path hijacking.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$;

-- Only expose execute permission to the roles that need it.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
