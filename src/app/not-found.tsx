import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={<Link href="/overview" className={buttonClass()}>Go to Overview</Link>}
      />
    </div>
  );
}
