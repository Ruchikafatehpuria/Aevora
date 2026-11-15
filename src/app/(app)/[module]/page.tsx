import { notFound } from "next/navigation";
import { Hammer } from "lucide-react";
import { findNavItem } from "@/lib/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const item = findNavItem(`/${(await params).module}`);
  return { title: item?.title ?? "Not found" };
}

// Placeholder for modules that haven't shipped yet. It says so plainly instead of showing fake UI.
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const item = findNavItem(`/${(await params).module}`);
  if (!item || item.available) notFound();
  const Icon = item.icon;
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card>
        <EmptyState
          icon={Icon}
          title={`${item.title} is being built`}
          description="This module isn't available yet. When it ships, it will appear here with its full functionality."
        />
        <div className="flex items-center justify-center gap-2 border-t border-border py-3 text-xs text-ink-3">
          <Hammer className="h-3.5 w-3.5" /> In development
        </div>
      </Card>
    </>
  );
}
