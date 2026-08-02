export interface PasswordRule {
  id: string;
  label: string;
  test: (v: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "One number", test: (v) => /[0-9]/.test(v) },
];

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(value));
}

export function passwordError(value: string): string | null {
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  if (failed.length === 0) return null;
  return `Password must contain: ${failed.map((f) => f.label.toLowerCase()).join(", ")}.`;
}
