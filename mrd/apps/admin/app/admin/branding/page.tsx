"use client";

import { useMedplum } from "@medplum/react";
import { useEffect, useState } from "react";
import type { Project, ProjectSetting } from "@medplum/fhirtypes";
import { AdminSidebar } from "@/components/admin-sidebar";
import { MedplumProvider } from "@/components/medplum-provider";
import { BrandLogo } from "@/components/brand-logo";
import { IconCheck, IconPalette } from "@tabler/icons-react";

const BRAND_PRESETS = [
  { id: "medrecord", name: "MEDrecord", color: "oklch(0.5 0.2 270)", hue: 270 },
  { id: "healthtalk", name: "HealthTalk", color: "oklch(0.55 0.2 250)", hue: 250 },
  { id: "coachi", name: "Coachi", color: "oklch(0.55 0.18 145)", hue: 145 },
  { id: "medsafe", name: "MedSafe", color: "oklch(0.55 0.15 185)", hue: 185 },
];

function BrandingPage() {
  const medplum = useMedplum();
  const [project, setProject] = useState<Project | undefined>();
  const [brandId, setBrandId] = useState<string>("medrecord");
  const [brandName, setBrandName] = useState<string>("MEDrecord");
  const [primaryColor, setPrimaryColor] = useState<string>("oklch(0.5 0.2 270)");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProject() {
      if (medplum.getActiveLogin()) {
        try {
          const proj = await medplum.getProject();
          setProject(proj);

          // Load existing brand settings
          const settings = proj.setting || [];
          const id = settings.find((s) => s.name === "brand.id")?.valueString || "medrecord";
          const name = settings.find((s) => s.name === "brand.name")?.valueString || "MEDrecord";
          const color = settings.find((s) => s.name === "brand.primaryColor")?.valueString || "oklch(0.5 0.2 270)";
          const logo = settings.find((s) => s.name === "brand.logoUrl")?.valueString || "";

          setBrandId(id);
          setBrandName(name);
          setPrimaryColor(color);
          setLogoUrl(logo);
        } catch (error) {
          console.error("Failed to load project:", error);
        }
      }
    }
    loadProject();
  }, [medplum]);

  async function saveBranding() {
    if (!project) return;

    setSaving(true);
    try {
      // Build new settings array
      const existingSettings = (project.setting || []).filter(
        (s) => !s.name?.startsWith("brand.")
      );

      const brandSettings: ProjectSetting[] = [
        { name: "brand.id", valueString: brandId },
        { name: "brand.name", valueString: brandName },
        { name: "brand.primaryColor", valueString: primaryColor },
      ];

      if (logoUrl) {
        brandSettings.push({ name: "brand.logoUrl", valueString: logoUrl });
      }

      await medplum.updateResource({
        ...project,
        setting: [...existingSettings, ...brandSettings],
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save branding:", error);
    } finally {
      setSaving(false);
    }
  }

  function selectPreset(preset: typeof BRAND_PRESETS[0]) {
    setBrandId(preset.id);
    setBrandName(preset.name);
    setPrimaryColor(preset.color);
  }

  return (
    <div className="flex h-screen" data-brand={brandId}>
      <AdminSidebar project={project} />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8 max-w-3xl">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Project Branding</h1>
            <p className="text-muted-foreground mt-1">
              Customize the look and feel of your project
            </p>
          </header>

          {/* Brand Presets */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Brand Presets</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {BRAND_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => selectPreset(preset)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    brandId === preset.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-lg mb-3 mx-auto"
                    style={{ backgroundColor: preset.color }}
                  />
                  <p className="text-sm font-medium text-foreground">{preset.name}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Custom Settings */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Custom Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Your Brand Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Primary Color (OKLCH)
                </label>
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="oklch(0.5 0.2 270)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: oklch(lightness chroma hue) - e.g., oklch(0.55 0.2 250) for blue
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Logo URL (optional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://example.com/logo.svg"
                />
              </div>
            </div>
          </section>

          {/* Preview */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Preview</h2>
            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="flex items-center gap-4 mb-4">
                <BrandLogo project={{ ...project, setting: [
                  { name: "brand.name", valueString: brandName },
                  { name: "brand.logoUrl", valueString: logoUrl },
                ]} as Project} size={40} />
                <div>
                  <p className="font-semibold text-foreground">{brandName}</p>
                  <p className="text-sm text-muted-foreground">Admin Portal</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: primaryColor, color: "white" }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium border"
                  style={{ borderColor: primaryColor, color: primaryColor }}
                >
                  Secondary Button
                </button>
              </div>
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button
              onClick={saveBranding}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? (
                <>
                  <IconCheck size={18} />
                  Saved
                </>
              ) : (
                <>
                  <IconPalette size={18} />
                  Save Branding
                </>
              )}
            </button>
            {saved && (
              <span className="text-sm text-green-600">
                Branding settings saved to Project.setting
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BrandingPageWrapper() {
  return (
    <MedplumProvider>
      <BrandingPage />
    </MedplumProvider>
  );
}
