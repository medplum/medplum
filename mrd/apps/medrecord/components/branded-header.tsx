'use client';

import Link from 'next/link';
import { VERSION } from '@/lib/version';

interface BrandedHeaderProps {
  user?: {
    name: string;
    initials: string;
  };
}

export function BrandedHeader({ user }: BrandedHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        {/* Logo and Brand */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold text-primary-foreground">MR</span>
          </div>
          <span className="font-semibold">MEDrecord</span>
        </Link>

        {/* Search */}
        <div className="ml-4 flex-1">
          <div className="relative max-w-md">
            <input
              type="search"
              placeholder="Search..."
              className="h-9 w-full rounded-md border bg-muted/50 px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* User Menu */}
        <div className="ml-auto flex items-center gap-4">
          {user && (
            <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {user.initials}
              </div>
              <span className="text-sm">{user.name}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
