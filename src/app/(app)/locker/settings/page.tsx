import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { configuredProviders, PROVIDER_LABEL } from "@/lib/ai/providers";
import { DEFAULT_CATEGORIES } from "@/lib/locker/config";
import { getLockerSettings } from "@/lib/locker/organize";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoriesEditor, OrganizeSettings, RulesEditor } from "@/components/locker/settings-forms";

export const metadata = { title: "Organization settings" };

export default async function LockerSettingsPage() {
  const user = await requireUser();
  const [settings, rules, custom] = await Promise.all([
    getLockerSettings(user.id),
    db.organizationRule.findMany({ where: { userId: user.id }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    db.fileCategory.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="AI organization" description="Choose how much Syncly organizes for you. You can change this any time." />
        <div className="p-5">
          <OrganizeSettings providers={configuredProviders().map((p) => PROVIDER_LABEL[p])} initial={{ organizeMode: settings.organizeMode, aiReadsContent: settings.aiReadsContent, autoApplyMinConfidence: settings.autoApplyMinConfidence }} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Organization rules" description="Rules run before AI and always win. They apply to new imports." />
        <div className="p-5"><RulesEditor rules={rules} /></div>
      </Card>
      <Card>
        <CardHeader title="Categories" description={`Built in: ${DEFAULT_CATEGORIES.join(", ")}. Add your own below.`} />
        <div className="p-5"><CategoriesEditor custom={custom} /></div>
      </Card>
    </div>
  );
}
