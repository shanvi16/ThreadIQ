import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/states';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass className="h-5 w-5" aria-hidden />}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={
          <Link to="/" className="inline-flex rounded-lg bg-sage-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-sage-800">
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}
