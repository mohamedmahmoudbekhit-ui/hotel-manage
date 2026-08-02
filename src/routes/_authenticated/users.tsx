import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useHotel } from "@/lib/hotel/store";
import {
  inviteTeamMember,
  listTeamMembers,
  regenerateTeamInvite,
  setTeamMemberStatus,
  type TeamMember,
} from "@/lib/team/users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
  head: () => ({
    meta: [
      { title: "User Management | Hotel Management" },
      { name: "description", content: "Invite, disable and reactivate hotel employees such as booking agents." },
      { property: "og:title", content: "User Management | Hotel Management" },
      { property: "og:description", content: "Invite, disable and reactivate hotel employees such as booking agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ROLE_LABEL: Record<string, string> = {
  hotel_admin: "Hotel Owner",
  hotel_staff: "Booking Agent",
};

function UsersPage() {
  const { memberRole, loading: hotelLoading } = useHotel();
  const navigate = useNavigate();
  const list = useServerFn(listTeamMembers);
  const invite = useServerFn(inviteTeamMember);
  const regenerate = useServerFn(regenerateTeamInvite);
  const setStatus = useServerFn(setTeamMemberStatus);

  const [rows, setRows] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"hotel_staff" | "hotel_admin">("hotel_staff");
  const [linkFor, setLinkFor] = useState<{ email: string; url: string } | null>(null);

  useEffect(() => {
    if (!hotelLoading && memberRole && memberRole !== "hotel_admin") {
      navigate({ to: "/bookings", replace: true });
    }
  }, [hotelLoading, memberRole, navigate]);

  const refresh = async () => {
    try {
      setRows(await list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activationUrl = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/activate?token=${token}`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invitation link copied");
    } catch {
      toast.error("Copy failed — select the link manually");
    }
  };

  const submitInvite = async () => {
    if (!email.trim()) return;
    setBusy("invite");
    try {
      const res = await invite({ data: { email: email.trim(), role } });
      setOpen(false);
      setEmail("");
      setRole("hotel_staff");
      setLinkFor({ email: res.email, url: activationUrl(res.token) });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setBusy(null);
    }
  };

  const doRegenerate = async (memberEmail: string) => {
    setBusy(memberEmail);
    try {
      const res = await regenerate({ data: { email: memberEmail } });
      setLinkFor({ email: memberEmail, url: activationUrl(res.token) });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate link");
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = async (m: TeamMember) => {
    const next = m.status === "disabled" ? "active" : "disabled";
    setBusy(m.userId);
    try {
      await setStatus({ data: { userId: m.userId, status: next } });
      toast.success(next === "active" ? "User reactivated" : "User disabled");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">Invite employees and control who can access your hotel.</p>
        </div>
        <Button className="ms-auto gap-2" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>Booking agents can view, create and edit bookings only.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">
                      {m.email || "—"}
                      {m.isSelf ? <span className="ms-2 text-xs text-muted-foreground">(you)</span> : null}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[m.role] ?? m.role}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === "active" ? "default" : m.status === "pending" ? "secondary" : "destructive"}
                      >
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.pendingInviteToken ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => copy(activationUrl(m.pendingInviteToken!))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy link
                          </Button>
                        ) : null}
                        {!m.isSelf ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={busy === m.email}
                            onClick={() => doRegenerate(m.email)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Regenerate link
                          </Button>
                        ) : null}
                        {!m.isSelf ? (
                          <Button
                            variant={m.status === "disabled" ? "default" : "destructive"}
                            size="sm"
                            disabled={busy === m.userId}
                            onClick={() => toggleStatus(m)}
                          >
                            {m.status === "disabled" ? "Reactivate" : "Disable"}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No users yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>An invitation link is generated for you to share. It expires in 24 hours.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-email">Employee email</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                maxLength={200}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@hotel.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger id="team-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel_staff">Booking Agent</SelectItem>
                  <SelectItem value="hotel_admin">Hotel Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitInvite} disabled={busy === "invite"}>
              {busy === "invite" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              Create invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkFor} onOpenChange={(v) => !v && setLinkFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitation link</DialogTitle>
            <DialogDescription>Share this link with {linkFor?.email}. It expires in 24 hours and can be used once.</DialogDescription>
          </DialogHeader>
          <div className="break-all rounded-md border bg-muted/40 p-3 text-xs">{linkFor?.url}</div>
          <DialogFooter>
            <Button className="gap-2" onClick={() => linkFor && copy(linkFor.url)}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
