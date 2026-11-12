import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Common';
import { ButtonLink } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page not found"
        description="The page you are looking for does not exist or has been moved."
        action={
          <ButtonLink to="/dashboard">Back to dashboard</ButtonLink>
        }
      />
    </div>
  );
}
