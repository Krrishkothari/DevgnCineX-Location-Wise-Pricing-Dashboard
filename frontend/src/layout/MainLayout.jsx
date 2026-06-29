import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export function MainLayout() {
  return (
    <div className="flex min-h-screen w-full bg-op-bg/50 text-op-textMain selection:bg-op-accent/30">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-[72px]">
        <TopHeader />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-6 md:p-8 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
