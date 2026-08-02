import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_RULES } from "@/lib/auth/password";
import { Check, X } from "lucide-react";

interface Props {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  label?: string;
}

export function PasswordFields({ password, confirm, onPassword, onConfirm, label = "Password" }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="pwd">{label}</Label>
        <Input
          id="pwd"
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pwd2">Confirm {label.toLowerCase()}</Label>
        <Input
          id="pwd2"
          type="password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
        {confirm.length > 0 && confirm !== password && (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        )}
      </div>
      <ul className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-xs">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={ok ? "flex items-center gap-2 text-green-700" : "flex items-center gap-2 text-muted-foreground"}>
              {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
