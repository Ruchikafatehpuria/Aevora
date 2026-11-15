import "server-only";
import { db } from "@/lib/db";

/** Marks a user's email verified and posts the welcome notification. */
export async function markEmailVerified(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } }),
    db.notification.create({
      data: {
        userId,
        title: "Welcome to Syncly",
        body: "Your email is verified. Complete your profile to personalise your workspace.",
        href: "/profile",
      },
    }),
  ]);
}
