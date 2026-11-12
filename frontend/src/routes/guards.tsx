import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { Permission } from '@/lib/types';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/Common';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <PageLoader label="Restoring your session…" />
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function RequirePermission({ permission, anyOf, children }: { permission?: Permission; anyOf?: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const allowed = (!permission || can(permission)) && (!anyOf || anyOf.some((p) => can(p)));
  if (!allowed) {
    return (
      <div className="card">
        <EmptyState
          icon={<ShieldOff className="size-6" />}
          title="Access restricted"
          description="Your role does not have permission to view this page. Contact an administrator if you need access."
        />
      </div>
    );
  }
  return <>{children}</>;
}
