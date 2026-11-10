import type { Location } from 'react-router-dom';

export interface AuthReturnLocation {
  pathname: string;
  search: string;
  hash: string;
}

export const safeAuthReturnLocation = (state: unknown): AuthReturnLocation | null => {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== 'object') return null;

  const candidate = from as Partial<Location>;
  const { pathname, search = '', hash = '' } = candidate;
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('\\') ||
    /[\u0000-\u001f]/.test(pathname) ||
    typeof search !== 'string' ||
    typeof hash !== 'string'
  ) {
    return null;
  }

  if (
    pathname === '/login' ||
    pathname === '/auth/login' ||
    pathname === '/register' ||
    pathname.startsWith('/register/') ||
    pathname.startsWith('/auth/register') ||
    pathname === '/auth/verify-email'
  ) {
    return null;
  }

  const route = new URL(`${pathname}${search}${hash}`, window.location.origin);
  if (route.origin !== window.location.origin) return null;
  return {
    pathname: route.pathname,
    search: route.search,
    hash: route.hash,
  };
};

export const authReturnState = (from: AuthReturnLocation) => ({ from });
