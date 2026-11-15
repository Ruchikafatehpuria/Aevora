import type { Profile } from "@prisma/client";

const checks: { key: string; label: string; done: (p: Profile) => boolean }[] = [
  { key: "headline", label: "Add a headline", done: (p) => !!p.headline },
  { key: "bio", label: "Write a short bio", done: (p) => !!p.bio },
  { key: "education", label: "Add your institution and field", done: (p) => !!p.institution && !!p.fieldOfStudy },
  { key: "location", label: "Set your location and timezone", done: (p) => !!p.location && !!p.timezone },
  { key: "interests", label: "Add at least 3 interests", done: (p) => p.interests.length >= 3 },
  { key: "skills", label: "Add at least 3 skills", done: (p) => p.skills.length >= 3 },
  { key: "goals", label: "Describe your career goals", done: (p) => !!p.careerGoals },
  { key: "links", label: "Link GitHub or LinkedIn", done: (p) => !!p.githubUsername || !!p.linkedinUrl },
];

export function profileCompleteness(p: Profile | null) {
  if (!p) return { percent: 0, missing: checks.map((c) => c.label) };
  const missing = checks.filter((c) => !c.done(p)).map((c) => c.label);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

// ICU still lists some zones under legacy names; show users the current IANA names.
const MODERN_ZONE: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
};

export function timezoneOptions() {
  return [...new Set(Intl.supportedValuesOf("timeZone").map((tz) => MODERN_ZONE[tz] ?? tz))].sort();
}
