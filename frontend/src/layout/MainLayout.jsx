import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export function MainLayout() {
  return (
    <div className="flex min-h-screen w-full bg-op-bg text-op-textMain">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-[72px]">
        <TopHeader />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
