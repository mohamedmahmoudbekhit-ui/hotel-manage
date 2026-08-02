import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { listOrganizations, createOrganization, updateOrganization, extendSubscription, deleteOrganization, resendInvitation, listSubscriptionPlans, type OrgRow } from "@/lib/admin/orgs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Copy, Ban, PlayCircle, CalendarPlus, Trash2, Send, Loader2, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/control/_shell/hotels")({
  component: HotelsPage,
});

type Plan = { code: string; name: string; monthly_price_cents: number; trial_days: number };

function HotelsPage() {
  const listFn = useServerFn(listOrganizations);
  const plansFn = useServerFn(listSubscriptionPlans);
  const createFn = useServerFn(createOrganization);
  const updateFn = useServerFn(updateOrganization);
  const extendFn = useServerFn(extendSubscription);
  const deleteFn = useServerFn(deleteOrganization);
  const resendFn = useServerFn(resendInvitation);

  const [rows, setRows] = useState<OrgRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ url: string; email: string; orgId: string } | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [extendFor, setExtendFor] = useState<OrgRow | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [editRow, setEditRow] = useState<OrgRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = () => listFn().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { refresh(); plansFn().then(setPlans).catch(() => {}); }, []);

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.subscription_status !== statusFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.hotel_name.toLowerCase().includes(s) || r.contact_email.toLowerCase().includes(s) || (r.contact_person ?? "").toLowerCase().includes(s);
  });

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await createFn({ data: {
        hotel_name: String(fd.get("hotel_name")),
        contact_email: String(fd.get("contact_email")),
        contact_mobile: String(fd.get("contact_mobile") || "") || undefined,
        contact_person: String(fd.get("contact_person")),
        subscription_plan: String(fd.get("subscription_plan")),
        notes: String(fd.get("notes") || "") || undefined,
      }});
      const url = `${window.location.origin}/activate?token=${res.inviteToken}`;
      setInviteInfo({ url, email: String(fd.get("contact_email")), orgId: res.id });
      setShowCreate(false);
      toast.success("Hotel created. Invitation link generated.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const toggleStatus = async (row: OrgRow, next: "active" | "suspended") => {
    try {
      await updateFn({ data: { id: row.id, patch: { account_status: next, subscription_status: next === "suspended" ? "suspended" : "active" } } });
      toast.success(next === "suspended" ? "Suspended" : "Reactivated");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleDelete = async (row: OrgRow) => {
    if (!confirm(`Delete ${row.hotel_name}? This wipes all their data.`)) return;
    try { await deleteFn({ data: { id: row.id } }); toast.success("Deleted"); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleResend = async (row: OrgRow) => {
    try {
      const res = await resendFn({ data: { organization_id: row.id } });
      const url = `${window.location.origin}/activate?token=${res.token}`;
      setInviteInfo({ url, email: res.email, orgId: row.id });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const regenerateInvite = async () => {
    if (!inviteInfo) return;
    setRegenBusy(true);
    try {
      const res = await resendFn({ data: { organization_id: inviteInfo.orgId } });
      setInviteInfo({ url: `${window.location.origin}/activate?token=${res.token}`, email: res.email, orgId: inviteInfo.orgId });
      toast.success("New invitation link generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRegenBusy(false);
    }
  };

  const handleExtend = async () => {
    if (!extendFor || !extendDate) return;
    try {
      await extendFn({ data: { id: extendFor.id, newExpiry: extendDate } });
      toast.success("Subscription extended");
      setExtendFor(null); setExtendDate(""); refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "").trim();
    setEditBusy(true);
    try {
      await updateFn({ data: {
        id: editRow.id,
        patch: {
          hotel_name: str("hotel_name"),
          contact_person: str("contact_person") || null,
          contact_email: str("contact_email"),
          contact_mobile: str("contact_mobile"),
          subscription_plan: str("subscription_plan"),
          subscription_status: str("subscription_status") as "trial" | "active" | "expired" | "suspended" | "cancelled",
          account_status: str("account_status") as "active" | "suspended",
          renewal_date: str("renewal_date") || null,
          expiry_date: str("expiry_date") || null,
          notes: str("notes") || null,
        },
      }});
      toast.success("Hotel details updated");
      setEditRow(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setEditBusy(false);
    }
  };



  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hotels</h1>
          <p className="text-sm text-muted-foreground">Manage subscribed hotels and their subscriptions.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="me-2 h-4 w-4" />Add hotel</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ps-8 w-64" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Hotel</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Renewal</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No hotels yet. Click "Add hotel" to create one.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.hotel_name}<div className="text-xs text-muted-foreground">{r.contact_email}</div></td>
                  <td className="px-3 py-2">{r.contact_person || "—"}</td>
                  <td className="px-3 py-2">{r.contact_mobile}</td>
                  <td className="px-3 py-2 capitalize">{r.subscription_plan}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.subscription_status} account={r.account_status} /></td>
                  <td className="px-3 py-2">{r.renewal_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Edit details" onClick={() => setEditRow(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Resend invitation" onClick={() => handleResend(r)}><Send className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Extend" onClick={() => { setExtendFor(r); setExtendDate(r.expiry_date ?? ""); }}><CalendarPlus className="h-3.5 w-3.5" /></Button>
                      {r.account_status === "suspended" ? (
                        <Button size="sm" variant="ghost" title="Reactivate" onClick={() => toggleStatus(r, "active")}><PlayCircle className="h-3.5 w-3.5 text-green-600" /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Suspend" onClick={() => toggleStatus(r, "suspended")}><Ban className="h-3.5 w-3.5 text-amber-600" /></Button>
                      )}
                      <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDelete(r)}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add hotel</DialogTitle>
              <DialogDescription>An invitation link is generated. The hotel admin uses it to set their password and access the app.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Field label="Hotel name *" name="hotel_name" required />
              <Field label="Hotel owner name *" name="contact_person" required />
              <Field label="Hotel owner email *" name="contact_email" type="email" required />
              <Field label="Contact mobile" name="contact_mobile" />
              <div>
                <Label>Subscription plan *</Label>
                <select name="subscription_plan" required defaultValue="trial" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {plans.map((p) => (<option key={p.code} value={p.code}>{p.name} {p.trial_days ? `(${p.trial_days}d trial)` : p.monthly_price_cents ? `- $${p.monthly_price_cents/100}/mo` : ""}</option>))}
                </select>
              </div>
              <Field label="Notes" name="notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Create & generate invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite result */}
      <Dialog open={!!inviteInfo} onOpenChange={(o) => !o && setInviteInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitation link</DialogTitle>
            <DialogDescription>Share this link with {inviteInfo?.email}. It expires in 24 hours. Use the regenerate action to issue a new link.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 py-2">
            <Input readOnly value={inviteInfo?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={() => { navigator.clipboard.writeText(inviteInfo?.url ?? ""); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={regenerateInvite} disabled={regenBusy}>
              {regenBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
              Regenerate link
            </Button>
            <Button onClick={() => setInviteInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={!!extendFor} onOpenChange={(o) => !o && setExtendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend subscription</DialogTitle>
            <DialogDescription>{extendFor?.hotel_name}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>New expiry date</Label>
            <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendFor(null)}>Cancel</Button>
            <Button onClick={handleExtend}>Extend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} className="mt-1" />
    </div>
  );
}

function StatusBadge({ status, account }: { status: string; account: string }) {
  if (account === "suspended") return <Badge variant="destructive">Suspended</Badge>;
  const cls: Record<string, string> = {
    trial: "bg-amber-100 text-amber-900",
    active: "bg-green-100 text-green-900",
    expired: "bg-red-100 text-red-900",
    suspended: "bg-red-100 text-red-900",
    cancelled: "bg-gray-100 text-gray-900",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls[status] ?? "bg-muted"}`}>{status}</span>;
}
