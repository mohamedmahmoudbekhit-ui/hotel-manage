import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listResetRequests,
  issueResetLink,
  createResetLinkForEmail,
  type ResetRequestRow,
} from "@/lib/auth/reset-requests.functions";

export const Route = createFileRoute("/control/_shell/resets")({
  component: ResetsPage,
});

function ResetsPage() {
  const listFn = useServerFn(listResetRequests);
  const issueFn = useServerFn(issueResetLink);
  const createFn = useServerFn(createResetLinkForEmail);

  const [rows, setRows] = useState<ResetRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkInfo, setLinkInfo] = useState<{ url: string; email: string } | null>(null);

  const refresh = () =>
    listFn()
      .then((r) => {
        setRows(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  useEffect(() => {
    refresh();
  }, []);

  const issue = async (row: ResetRequestRow) => {
    try {
      const res = await issueFn({ data: { id: row.id } });
      setLinkInfo({ url: `${window.location.origin}/new-password?token=${res.token}`, email: res.email });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const createForEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await createFn({ data: { email: String(fd.get("email")) } });
      setLinkInfo({ url: `${window.location.origin}/new-password?token=${res.token}`, email: res.email });
      e.currentTarget.reset();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Password resets</h1>
        <p className="text-sm text-muted-foreground">
          Hotel users request a reset here. Issue a secure link and share it manually — links last 1 hour and work once.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={createForEmail} className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="email">Create a link for an email</Label>
            <Input id="email" name="email" type="email" required placeholder="owner@hotel.com" className="mt-1 w-72" />
          </div>
          <Button type="submit">
            <KeyRound className="me-2 h-4 w-4" />
            Generate link
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Hotel</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No password reset requests yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{r.email}</td>
                    <td className="px-3 py-2">{r.hotel_name ?? "—"}</td>
                    <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <StatusPill row={r} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => issue(r)}>
                        <RefreshCw className="me-1.5 h-3.5 w-3.5" />
                        {r.status === "pending" ? "Issue link" : "New link"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!linkInfo} onOpenChange={(o) => !o && setLinkInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link</DialogTitle>
            <DialogDescription>
              Share this link with {linkInfo?.email}. It expires in 1 hour and can only be used once.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 py-2">
            <Input readOnly value={linkInfo?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(linkInfo?.url ?? "");
                toast.success("Copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ row }: { row: ResetRequestRow }) {
  const expired = row.status === "issued" && row.expires_at && new Date(row.expires_at) < new Date();
  const label = row.status === "used" ? "Used" : expired ? "Expired" : row.status === "issued" ? "Link issued" : "Pending";
  const cls =
    label === "Used"
      ? "bg-gray-100 text-gray-900"
      : label === "Expired"
        ? "bg-red-100 text-red-900"
        : label === "Link issued"
          ? "bg-green-100 text-green-900"
          : "bg-amber-100 text-amber-900";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
