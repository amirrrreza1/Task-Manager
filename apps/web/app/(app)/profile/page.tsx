'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../../components/auth-provider';

export default function ProfileRedirectPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(`/profile/${user.id}`);
  }, [router, user]);

  return (
    <div className="session-loader" role="status">
      <span className="spinner" aria-hidden="true" />
      Opening profile…
    </div>
  );
}
