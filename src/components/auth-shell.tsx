import { Hotel } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Hotel className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold">Hotel Management</div>
            <div className="text-xs text-muted-foreground">Property management suite</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-lg">{children}</div>
      </div>
    </div>
  );
}
