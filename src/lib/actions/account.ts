"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, destroyCurrentSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/validation";
import type { FormState } from "@/lib/auth/actions";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : /^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.string().url("Enter a valid URL").max(300).nullable());

const tags = z
  .string()
  .transform((v) => [...new Set(v.split(",").map((t) => t.trim()).filter(Boolean))])
  .pipe(z.array(z.string().max(40)).max(30, "Keep it to 30 or fewer"));

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  headline: optional(120),
  bio: optional(1000),
  institution: optional(120),
  fieldOfStudy: optional(120),
  educationLevel: optional(60),
  graduationYear: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(1950, "Enter a valid year").max(2100, "Enter a valid year").nullable()),
  location: optional(120),
  timezone: optional(60).refine((tz) => {
    if (!tz) return true;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
  interests: tags,
  skills: tags,
  careerGoals: optional(1000),
  linkedinUrl: optionalUrl,
  githubUsername: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(/^@/, "").replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "")))
    .pipe(z.string().regex(/^[a-z\d](?:[a-z\d-]{0,38})$/i, "Enter a valid GitHub username").nullable()),
  websiteUrl: optionalUrl,
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { name, ...profile } = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      profile: { upsert: { create: { ...profile, onboarded: true }, update: { ...profile, onboarded: true } } },
    },
  });
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({ current: z.string().min(1, "Enter your current password"), password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { fieldErrors: { current: ["Current password is incorrect"] } };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: hashToken(token) } } }),
    db.notification.create({ data: { userId: user.id, title: "Password changed", body: "Your other sessions were signed out." } }),
  ]);
  revalidatePath("/", "layout");
  return { success: "Password updated. Other sessions were signed out." };
}

export async function revokeSession(sessionId: string) {
  const user = await requireUser();
  await db.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  revalidatePath("/settings");
}

export async function revokeOtherSessions() {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: hashToken(token) } } });
  revalidatePath("/settings");
}

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (formData.get("confirm") !== "DELETE") return { fieldErrors: { confirm: ['Type "DELETE" to confirm'] } };
  if (!(await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash))) {
    return { fieldErrors: { password: ["Password is incorrect"] } };
  }
  await destroyCurrentSession();
  await db.user.delete({ where: { id: user.id } });
  redirect("/");
}
