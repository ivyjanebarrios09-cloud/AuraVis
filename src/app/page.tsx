
'use client';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AuraVisUI } from '@/components/aura-vis-ui';
import { AuthUI } from '@/components/auth-ui';
import { useEffect } from 'react';

function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // This will run when the component mounts and whenever the user changes.
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return user ? <AuraVisUI /> : <AuthUI />;
}

export default function Home() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
