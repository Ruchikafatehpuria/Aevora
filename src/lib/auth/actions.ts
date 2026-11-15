"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { devEmailShortcuts, emailUnavailable, sendMail, verificationEmail, passwordResetEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/utils";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroyCurrentSession, getCurrentUser } from "./session";
import { consumeToken, issueToken } from "./tokens";
import { markEmailVerified } from "./verify";
import { emailSchema, loginSchema, resetSchema, signupSchema } from "./validation";

export type FormState = {
  error?: string;
  success?: string;
  /** Development only: a link that would normally arrive by email. */
  devLink?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

// A real bcrypt hash used to keep login timing similar for unknown emails.
const DUMMY_HASH = "$2b$12$aZ0iXF0576Ag1dU0ClpiR.c91LL1J31zW8Orv.5R0JISKmfHZA2YO";

async function sendVerification(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  await sendMail(verificationEmail(user.email, user.name, appUrl(`/api/auth/verify?token=${token}`)));
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = signupSchema.safeParse(raw);
  const values = { name: raw.name ?? "", email: raw.email ?? "" };
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  if (!(await rateLimit(`signup:${await clientIp()}`, 10, 3600))) {
    return { error: "Too many sign-up attempts. Please try again later.", values };
  }

  const { name, email, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists. Log in or reset your password.", values };
  }

  if (emailUnavailable()) {
    // No email service on this deployment: a verification email could never arrive.
    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), emailVerified: new Date(), profile: { create: {} } },
    });
    await createSession(user.id);
    redirect("/overview?welcome=1");
  }

  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password), profile: { create: {} } },
  });
  try {
    await sendVerification(user);
  } catch (e) {
    console.error("Failed to send verification email", e);
  }
  await createSession(user.id);
  redirect("/verify-email");
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = loginSchema.safeParse(raw);
  const values = { email: raw.email ?? "" };
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  const { email, password } = parsed.data;
  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}:${email}`, 8, 900)) || !(await rateLimit(`login-ip:${ip}`, 50, 900))) {
    return { error: "Too many login attempts. Wait 15 minutes and try again.", values };
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Incorrect email or password.", values };

  await createSession(user.id);
  const next = String(formData.get("next") ?? "");
  redirect(user.emailVerified ? (next.startsWith("/") && !next.startsWith("//") ? next : "/overview") : "/verify-email");
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function resendVerification(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/overview");
  if (!(await rateLimit(`verify-resend:${user.id}`, 3, 900))) {
    return { error: "You've requested several emails recently. Please wait a few minutes." };
  }
  try {
    await sendVerification(user);
  } catch {
    return { error: "We couldn't send the email. Please try again shortly." };
  }
  return { success: `We sent a new verification link to ${user.email}.` };
}

/** Development-only shortcut for when email can't be delivered: verifies the signed-in user's email. */
export async function devVerifyNow() {
  if (!devEmailShortcuts()) throw new Error("Not available");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/overview");
  await markEmailVerified(user.id);
  redirect("/overview?welcome=1");
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues.map((i) => i.message) } };
  const email = parsed.data;

  if (emailUnavailable()) {
    return { error: "Password reset by email isn't set up on this site yet. Please contact the site owner." };
  }
  const generic = { success: "If an account exists for that email, we've sent a password reset link." };
  if (!(await rateLimit(`reset:${await clientIp()}`, 5, 900))) {
    return { error: "Too many reset requests. Please try again in 15 minutes." };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    const link = appUrl(`/reset-password?token=${token}`);
    try {
      await sendMail(passwordResetEmail(user.email, link));
    } catch (e) {
      console.error("Failed to send reset email", e);
    }
    if (devEmailShortcuts()) return { ...generic, devLink: link };
  }
  return generic;
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const userId = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return { error: "This reset link is invalid or has expired. Request a new one." };

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      // Following a link from the inbox also proves ownership of the email.
      data: { passwordHash: await hashPassword(parsed.data.password), emailVerified: new Date() },
    }),
    db.session.deleteMany({ where: { userId } }),
    db.notification.create({
      data: { userId, title: "Your password was reset", body: "All other sessions were signed out." },
    }),
  ]);
  await createSession(userId);
  redirect("/overview");
}
