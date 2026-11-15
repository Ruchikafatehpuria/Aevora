import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

type Mail = { to: string; subject: string; text: string; html: string };

/**
 * True only on a local development server with no SMTP configured: emails can't be delivered, so the
 * app shows verification and reset links on screen instead. Always false in production.
 */
export const devEmailShortcuts = () => process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST;

let transporter: Transporter | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendMail(mail: Mail) {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured. Set SMTP_HOST to send email in production.");
    }
    // Development fallback: no SMTP configured, so print the email for the developer.
    console.info(`\n──── [dev email] to: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n────\n`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM, ...mail });
}

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f7fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e3e8ee">
<div style="font-weight:700;font-size:18px;color:#0f2742;margin-bottom:24px">Syncly</div>
<h1 style="font-size:20px;color:#0f2742;margin:0 0 12px">${title}</h1>
<p style="color:#475569;line-height:1.6;margin:0 0 24px">${body}</p>
<a href="${cta.url}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${cta.label}</a>
<p style="color:#94a3b8;font-size:12px;margin-top:24px">If the button doesn't work, paste this link into your browser:<br>${cta.url}</p>
</div></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: "Verify your Syncly email",
    text: `Hi ${name},\n\nConfirm your email to finish setting up Syncly:\n${url}\n\nThis link expires in 24 hours.`,
    html: layout(`Welcome, ${name}`, "Confirm your email address to finish setting up your Syncly workspace. This link expires in 24 hours.", { label: "Verify email", url }),
  };
}

export function passwordResetEmail(to: string, url: string): Mail {
  return {
    to,
    subject: "Reset your Syncly password",
    text: `Someone requested a password reset for your Syncly account.\n\nReset it here (expires in 1 hour):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
    html: layout("Reset your password", "Use the button below to choose a new password. The link expires in 1 hour. If you didn't request this, you can ignore this email.", { label: "Reset password", url }),
  };
}
