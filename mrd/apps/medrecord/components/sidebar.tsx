'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VERSION } from '@/lib/version';

interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: 'Favorites',
    items: [
      { label: 'Patient', href: '/Patient' },
      { label: 'Practitioner', href: '/Practitioner' },
      { label: 'Organization', href: '/Organization' },
      { label: 'ServiceRequest', href: '/ServiceRequest' },
      { label: 'DiagnosticReport', href: '/DiagnosticReport' },
      { label: 'Questionnaire', href: '/Questionnaire' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Project', href: '/admin/project' },
      { label: 'AccessPolicy', href: '/admin/access-policy' },
      { label: 'Subscriptions', href: '/admin/subscriptions' },
      { label: 'Batch', href: '/admin/batch' },
      { label: 'Config', href: '/admin/config' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Security', href: '/settings/security' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-background">
      {/* Resource Type Selector */}
      <div className="p-3">
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option>Resource Type</option>
        </select>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3">
        {navigation.map((section) => (
          <div key={section.title} className="mb-4">
            <h3 className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">
              {section.title}
            </h3>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Version Footer */}
      <div className="border-t p-3">
        <p className="text-xs text-muted-foreground text-right">
          MEDrecord: {VERSION.short}
        </p>
      </div>
    </aside>
  );
}
