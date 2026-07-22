import { Outlet } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { FilterProvider } from '../lib/filters';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function MainLayout() {
  return (
    <FilterProvider>
      <div className="aurora flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>

        <TopHeader />

        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </FilterProvider>
  );
}
