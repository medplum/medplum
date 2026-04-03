"use client";

import { useMedplum, useMedplumProfile } from "@medplum/react";
import { useEffect, useState } from "react";
import type { Project } from "@medplum/fhirtypes";
import { AdminSidebar } from "@/components/admin-sidebar";
import { MedplumProvider } from "@/components/medplum-provider";
import { IconArrowRight, IconShieldCheck, IconUsers, IconFolder } from "@tabler/icons-react";

function AdminDashboard() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [project, setProject] = useState<Project | undefined>();
  const [brandId, setBrandId] = useState<string>("medrecord");

  useEffect(() => {
    async function loadProject() {
      if (medplum.getActiveLogin()) {
        try {
          const proj = await medplum.getProject();
          setProject(proj);
          const brand = proj.setting?.find((s) => s.name === "brand.id")?.valueString;
          if (brand) {
            setBrandId(brand);
          }
        } catch (error) {
          console.error("Failed to load project:", error);
        }
      }
    }
    loadProject();
  }, [medplum]);

  if (!medplum.getActiveLogin()) {
    return <LoginPrompt />;
  }

  return (
    <div className="flex h-screen" data-brand={brandId}>
      <AdminSidebar project={project} />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">
              Welcome back{profile?.name?.[0]?.given?.[0] ? `, ${profile.name[0].given[0]}` : ""}
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your {project?.name || "MEDrecord"} project
            </p>
          </header>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard
              title="Total Users"
              value="--"
              description="Active project members"
              icon={IconUsers}
            />
            <StatCard
              title="Organizations"
              value="--"
              description="Registered organizations"
              icon={IconFolder}
            />
            <StatCard
              title="Access Policies"
              value="--"
              description="Security policies configured"
              icon={IconShieldCheck}
            />
          </div>

          {/* Quick Actions */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <QuickAction
                title="Configure Branding"
                description="Set logo, colors, and brand name for this project"
                href="/admin/branding"
              />
              <QuickAction
                title="Manage Users"
                description="Add or remove users from this project"
                href="/admin/users"
              />
              <QuickAction
                title="Access Policies"
                description="Configure permissions and access control"
                href="/AccessPolicy"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function LoginPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <IconShieldCheck size={32} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">MEDrecord Admin</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to access your project administration panel
        </p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Sign In
          <IconArrowRight size={18} />
        </a>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof IconUsers;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon size={20} className="text-primary" />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all group"
    >
      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      <div className="flex items-center gap-1 text-primary text-sm mt-3">
        Configure
        <IconArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
      </div>
    </a>
  );
}

export default function AdminPage() {
  return (
    <MedplumProvider>
      <AdminDashboard />
    </MedplumProvider>
  );
}
