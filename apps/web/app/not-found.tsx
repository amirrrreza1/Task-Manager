import type { Metadata } from 'next';
import { companyName } from '../lib/app-config';
import { NotFoundView } from './not-found-view';

export const metadata: Metadata = {
  title: `404 - Page Not Found · ${companyName}`,
  description: 'The requested page could not be found.',
};

export default function NotFound() {
  return <NotFoundView />;
}
