'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AccessRole = 'companyOwner' | 'owner' | 'admin' | 'member' | 'none';

type AccessContextValue = {
  role: AccessRole;
  isAuthorized: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue>({
  role: 'none',
  isAuthorized: false,
  loading: true,
  refresh: async () => {},
});

async function fetchAccessRole(): Promise<{ role: AccessRole; isAuthorized: boolean }> {
  try {
    const response = await fetch('/api/auth/role', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      return { role: 'none', isAuthorized: false };
    }

    const data = await response.json();
    const role = data.role as AccessRole | undefined;
    const isAuthorized = Boolean(data.isAuthorized);
    if (role === 'companyOwner' || role === 'owner' || role === 'admin' || role === 'member' || role === 'none') {
      return { role, isAuthorized };
    }

    return { role: 'none', isAuthorized: false };
  } catch (error) {
    console.error('Failed to load access role', error);
    return { role: 'none', isAuthorized: false };
  }
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<AccessRole>('none');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchAccessRole();
    setRole(result.role);
    setIsAuthorized(result.isAuthorized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AccessContextValue>(
    () => ({
      role,
      isAuthorized,
      loading,
      refresh,
    }),
    [role, isAuthorized, loading, refresh],
  );

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}

