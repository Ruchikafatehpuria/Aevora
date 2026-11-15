"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login, signup, requestPasswordReset, resetPassword, resendVerification, type FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";

function PasswordInput({ id, name, autoComplete, invalid }: { id: string; name: string; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={invalid} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

const initial: FormState = {};

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice && !state.error && <Alert tone="success">{notice}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" invalid={!!state.fieldErrors?.password} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Log in
      </Button>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Full name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required defaultValue={state.values?.name} aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password} hint="At least 8 characters, with a letter and a number.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!state.fieldErrors?.password} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  if (state.success)
    return (
      <div className="space-y-3">
        <Alert tone="success">{state.success}</Alert>
        {state.devLink && (
          <Alert tone="info">
            Email isn&apos;t set up on this development server, so here is your reset link:{" "}
            <a href={state.devLink} className="font-medium underline">Reset my password</a>
          </Alert>
        )}
      </div>
    );
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && (
        <Alert tone="error">
          {state.error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" error={state.fieldErrors?.password} hint="At least 8 characters, with a letter and a number.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!state.fieldErrors?.password} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!state.fieldErrors?.confirm} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Set new password
      </Button>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action, pending] = useActionState(resendVerification, initial);
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <Button type="submit" variant="secondary" className="w-full" loading={pending}>
        Resend verification email
      </Button>
    </form>
  );
}
