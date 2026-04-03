"use client";

import type { Project } from "@medplum/fhirtypes";
import {
  IconUsers,
  IconBuilding,
  IconSettings,
  IconLock,
  IconFolder,
  IconWebhook,
  IconKey,
  IconWorld,
  IconPalette,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./brand-logo";

interface AdminSidebarProps {
  project?: Project;
}

const menuItems = [
  { title: "Favorites", items: [
    { label: "Patient", href: "/Patient", icon: IconUsers },
    { label: "Practitioner", href: "/Practitioner", icon: IconUsers },
    { label: "Organization", href: "/Organization", icon: IconBuilding },
  ]},
  { title: "Admin", items: [
    { label: "Project", href: "/admin/project", icon: IconFolder },
    { label: "Users", href: "/admin/users", icon: IconUsers },
    { label: "Clients", href: "/admin/clients", icon: IconKey },
    { label: "AccessPolicy", href: "/AccessPolicy", icon: IconLock },
    { label: "Subscriptions", href: "/Subscription", icon: IconWebhook },
    { label: "Sites", href: "/admin/sites", icon: IconWorld },
    { label: "Branding", href: "/admin/branding", icon: IconPalette },
  ]},
  { title: "Settings", items: [
    { label: "Security", href: "/security", icon: IconLock },
    { label: "Config", href: "/admin/config", icon: IconSettings },
  ]},
];

export function AdminSidebar({ project }: AdminSidebarProps) {
  const pathname = usePathname();
  const brandName = project?.setting?.find((s) => s.name === "brand.name")?.valueString || "MEDrecord";

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo & Brand */}
      <div className="p-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo project={project} size={32} />
          <span className="font-semibold text-sidebar-foreground">{brandName}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {menuItems.map((section) => (
          <div key={section.title} className="mb-4">
            <h3 className="px-3 py-2 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Project Info */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/60">Project</p>
        <p className="text-sm font-medium text-sidebar-foreground truncate">
          {project?.name || "Loading..."}
        </p>
      </div>
    </aside>
  );
}
