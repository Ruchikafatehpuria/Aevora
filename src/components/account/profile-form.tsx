"use client";

import { useActionState } from "react";
import type { Profile } from "@prisma/client";
import { updateProfile } from "@/lib/actions/account";
import type { FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TagInput } from "./tag-input";

const LEVELS = ["High school", "Diploma", "Undergraduate", "Postgraduate", "Doctorate", "Working professional", "Other"];

export function ProfileForm({ name, email, profile, timezones }: { name: string; email: string; profile: Profile | null; timezones: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  const e = state.fieldErrors ?? {};
  const p = profile;
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <Card>
        <CardHeader title="Basics" description="How you appear across Syncly." />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={e.name}>
            <Input id="name" name="name" defaultValue={name} required aria-invalid={!!e.name} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Your login email can't be changed yet.">
            <Input id="email" value={email} disabled readOnly />
          </Field>
          <Field label="Headline" htmlFor="headline" error={e.headline} className="sm:col-span-2" hint="e.g. Computer Science student · aspiring ML engineer">
            <Input id="headline" name="headline" defaultValue={p?.headline ?? ""} maxLength={120} />
          </Field>
          <Field label="Bio" htmlFor="bio" error={e.bio} className="sm:col-span-2">
            <Textarea id="bio" name="bio" defaultValue={p?.bio ?? ""} maxLength={1000} placeholder="A few sentences about you." />
          </Field>
          <Field label="Location" htmlFor="location" error={e.location}>
            <Input id="location" name="location" defaultValue={p?.location ?? ""} placeholder="City, Country" />
          </Field>
          <Field label="Timezone" htmlFor="timezone" error={e.timezone}>
            <Select id="timezone" name="timezone" defaultValue={p?.timezone ?? ""}>
              <option value="">Select timezone</option>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Education" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Institution" htmlFor="institution" error={e.institution}>
            <Input id="institution" name="institution" defaultValue={p?.institution ?? ""} />
          </Field>
          <Field label="Field of study" htmlFor="fieldOfStudy" error={e.fieldOfStudy}>
            <Input id="fieldOfStudy" name="fieldOfStudy" defaultValue={p?.fieldOfStudy ?? ""} />
          </Field>
          <Field label="Level" htmlFor="educationLevel" error={e.educationLevel}>
            <Select id="educationLevel" name="educationLevel" defaultValue={p?.educationLevel ?? ""}>
              <option value="">Select level</option>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Graduation year" htmlFor="graduationYear" error={e.graduationYear}>
            <Input id="graduationYear" name="graduationYear" inputMode="numeric" defaultValue={p?.graduationYear ?? ""} aria-invalid={!!e.graduationYear} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Interests, skills and goals" description="Used to personalise learning, internships and scholarships." />
        <div className="grid gap-5 p-5">
          <Field label="Interests" htmlFor="interests" error={e.interests} hint="Press Enter or comma to add.">
            <TagInput id="interests" name="interests" defaultValue={p?.interests ?? []} placeholder="Machine learning, design, finance…" />
          </Field>
          <Field label="Skills" htmlFor="skills" error={e.skills} hint="Press Enter or comma to add.">
            <TagInput id="skills" name="skills" defaultValue={p?.skills ?? []} placeholder="Python, React, public speaking…" />
          </Field>
          <Field label="Career goals" htmlFor="careerGoals" error={e.careerGoals}>
            <Textarea id="careerGoals" name="careerGoals" defaultValue={p?.careerGoals ?? ""} maxLength={1000} placeholder="Where do you want to be in 1–3 years?" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Links" />
        <div className="grid gap-5 p-5 sm:grid-cols-3">
          <Field label="GitHub username" htmlFor="githubUsername" error={e.githubUsername}>
            <Input id="githubUsername" name="githubUsername" defaultValue={p?.githubUsername ?? ""} aria-invalid={!!e.githubUsername} />
          </Field>
          <Field label="LinkedIn URL" htmlFor="linkedinUrl" error={e.linkedinUrl}>
            <Input id="linkedinUrl" name="linkedinUrl" defaultValue={p?.linkedinUrl ?? ""} aria-invalid={!!e.linkedinUrl} />
          </Field>
          <Field label="Website" htmlFor="websiteUrl" error={e.websiteUrl}>
            <Input id="websiteUrl" name="websiteUrl" defaultValue={p?.websiteUrl ?? ""} aria-invalid={!!e.websiteUrl} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={pending} className="shadow-lg">
          Save profile
        </Button>
      </div>
    </form>
  );
}
