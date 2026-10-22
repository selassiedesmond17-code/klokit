import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/report-filters";

type Session = {
  id: string;
  title: string;
  token: string;
  room_id: string;
  starts_at: string;
  expires_at: string;
};
type Room = { id: string; name: string; department_id: string };

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const [orgRes, adminRes, mineRes, roomsRes, sessRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, timezone, status")
      .eq("id", orgId)
      .single(),
    supabase.rpc("is_org_admin", { org: orgId }),
    supabase
      .from("department_members")
      .select("department_id, role")
      .eq("organization_id", orgId)
      .eq("user_id", user!.id),
    supabase
      .from("rooms")
      .select("id, name, department_id")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("attendance_sessions")
      .select("id, title, token, room_id, starts_at, expires_at")
      .eq("organization_id", orgId)
      .gte("expires_at", since)
      .order("starts_at")
      .limit(300),
  ]);

  const org = orgRes.data;
  if (!org) notFound();
  const tz = org.timezone ?? "UTC";
  const isOrgAdmin = Boolean(adminRes.data);
  const mine = (mineRes.data ?? []) as { department_id: string; role: string }[];
  const memberDepts = new Set(mine.map((m) => m.department_id));
  const managerDepts = new Set(
    mine.filter((m) => m.role !== "user").map((m) => m.department_id)
  );
  const rooms = (roomsRes.data ?? []) as Room[];
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const sessions = (sessRes.data ?? []) as Session[];

  const manageableRooms = rooms.filter(
    (r) => isOrgAdmin || managerDepts.has(r.department_id)
  );
  const manages = (s: Session) => {
    const r = roomById.get(s.room_id);
    return r ? isOrgAdmin || managerDepts.has(r.department_id) : false;
  };

  const now = Date.now();
  const t = (iso: string) => new Date(iso).getTime();
  const live = sessions.filter((s) => t(s.starts_at) <= now && t(s.expires_at) >= now);
  const upcoming = sessions
    .filter((s) => t(s.starts_at) > now)
    .sort((a, b) => t(a.starts_at) - t(b.starts_at));
  const ended = sessions
    .filter((s) => t(s.expires_at) < now && manages(s))
    .sort((a, b) => t(b.starts_at) - t(a.starts_at))
    .slice(0, 20);

  const card = (s: Session, kind: "live" | "upcoming" | "ended") => {
    const room = roomById.get(s.room_id);
    const isMember = room ? memberDepts.has(room.department_id) : false;
    return (
      <li key={s.id} className="neu-raised flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{s.title}</span>
          <span
            className={`neu-badge ${
              kind === "live" ? "badge-ok" : kind === "upcoming" ? "badge-blue" : ""
            }`}
          >
            {kind === "live" ? "Live now" : kind === "upcoming" ? "Upcoming" : "Ended"}
          </span>
        </div>
        <div className="muted text-sm">
          {room?.name ?? "Room"} · {fmt(s.starts_at, tz)} → {fmt(s.expires_at, tz)}
        </div>
        <div className="flex flex-wrap gap-3">
          {kind === "live" && isMember && (
            <Link href={`/s/${s.token}`} className="neu-btn neu-btn-success">
              Join to clock in or out
            </Link>
          )}
          {manages(s) && room && (
            <Link
              href={`/org/${orgId}/rooms/${room.id}/sessions/${s.id}`}
              className="neu-btn neu-btn-sm"
            >
              Manage
            </Link>
          )}
        </div>
      </li>
    );
  };

  return (
    <main className="page max-w-2xl">
      <h1 className="text-2xl font-semibold">Sessions</h1>
      <p className="muted text-sm">
        {org.name} · times are shown in {tz}
      </p>

      {org.status !== "active" && (
        <p className="alert alert-warn mt-4">This organization is not active.</p>
      )}

      <h2 className="mt-6 flex items-center gap-2 text-lg font-medium">
        Live now <span className="neu-badge badge-ok">{live.length}</span>
      </h2>
      <ul className="mt-3 flex flex-col gap-4">
        {live.length === 0 && (
          <li className="neu-inset muted">Nothing is live right now.</li>
        )}
        {live.map((s) => card(s, "live"))}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Upcoming</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {upcoming.length === 0 && (
          <li className="neu-inset muted">No upcoming sessions.</li>
        )}
        {upcoming.slice(0, 15).map((s) => card(s, "upcoming"))}
        {upcoming.length > 15 && (
          <li className="muted text-sm">
            …and {upcoming.length - 15} more later
          </li>
        )}
      </ul>

      {manageableRooms.length > 0 && (
        <>
          <section className="neu-card mt-8">
            <h2 className="text-lg font-medium">Start a new session</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {manageableRooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/org/${orgId}/rooms/${r.id}/sessions`}
                  className="neu-btn neu-btn-sm neu-btn-primary"
                >
                  + {r.name}
                </Link>
              ))}
            </div>
          </section>

          <h2 className="mt-8 text-lg font-medium">Recently ended</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {ended.length === 0 && (
              <li className="neu-inset muted">No ended sessions yet.</li>
            )}
            {ended.map((s) => card(s, "ended"))}
          </ul>
        </>
      )}
    </main>
  );
}