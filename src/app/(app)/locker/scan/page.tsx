import { requireUser } from "@/lib/auth/session";
import { Scanner } from "@/components/locker/scanner";

export const metadata = { title: "Scan a document" };

export default async function ScanPage() {
  await requireUser();
  return <Scanner />;
}
