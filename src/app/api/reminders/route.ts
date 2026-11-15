import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fireDueReminders } from "@/lib/tasks/server";

/** Polled by the app shell about once a minute: sends any reminders that are now due. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ fired: [] }, { status: 401 });
  const fired = await fireDueReminders(session.user.id);
  return NextResponse.json({ fired });
}
