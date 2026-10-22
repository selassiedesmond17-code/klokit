import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ProfileNotice from "@/components/profile-notice";
import InstallApp from "@/components/install-app";
import { deptRoleText } from "@/lib/dept";

type Membership = {
  role: string;
  organizations: {
    id: string;
    name: string;
    status: string;
    org_type: string;
    timezone: string;
  } | null;
};
type DM = {
  organization_id: string;
  department_id: string;
  role: string;
  title: string | null;
};
type OrgRow = { organization_id: string };
type Sess = {
  id: string;
  title: string;
  token: string;
  room_id: string;
  organization_id: string;
  starts_at: string;
  expires_at: string;
};

const NIL = "00000000-0000-0000-0000-000000000000";

function count(rows: OrgRow[], orgId: string) {
  return rows.filter((r) => r.organization_id === orgId).length;
}

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="neu-inset flex flex-col items-center gap-1 text-center">
      <span className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</span>
      <span className="muted text-xs">{label}</span>
    </div>
  );
}

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Accept any invitations waiting for this email address
  await supabase.rpc("claim_invites");

  const [memRes, dmRes, paRes, nameRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, organizations(id, name, status, org_type, timezone)")
      .eq("user_id", user!.id),
    supabase
      .from("department_members")
      .select("organization_id, department_id, role, title")
      .eq("user_id", user!.id),
    supabase.rpc("is_platform_admin"),
    supabase
      .from("org_profiles")
      .select("full_name")
      .eq("user_id", user!.id)
      .not("full_name", "is", null)
      .limit(1),
  ]);

  const memberships = (
    (memRes.data ?? []) as unknown as Membership[]
  ).filter((m) => m.organizations);

  // The superadmin has no organization of their own: 
   if (paRes.data && memberships.length === 0) {
     return (
       <main className="page max-w-md">
         <div className="neu-card flex flex-col gap-4">
           <h1 className="text-xl font-semibold">Superadmin account</h1>
           <p className="muted text-sm">
             This account manages KlokIt from its own admin site and cannot be
             used here.
           </p>
           {process.env.NEXT_PUBLIC_ADMIN_URL && (
             <a
               href={process.env.NEXT_PUBLIC_ADMIN_URL}
               className="neu-btn neu-btn-primary"
             >
               Open the admin site
             </a>
           )}
           <form action="/auth/signout" method="post">
             <button className="neu-btn w-full">Sign out</button>
           </form>
         </div>
       </main>
     );
   }

  const dms = (dmRes.data ?? []) as unknown as DM[];
  const name =
    ((nameRes.data ?? []) as { full_name: string | null }[])[0]?.full_name ??
    null;
  const ids = memberships.length
    ? memberships.map((m) => m.organizations!.id)
    : [NIL];

  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [roomsRes, sessRes, deptsRes, recentRes, pendingRes] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("id, organization_id, department_id")
        .in("organization_id", ids),
      supabase
        .from("attendance_sessions")
        .select("id, title, token, room_id, organization_id, starts_at, expires_at")
        .in("organization_id", ids)
        .gte("expires_at", nowIso)
        .order("starts_at")
        .limit(200),
      supabase.from("departments").select("organization_id").in("organization_id", ids),
      supabase
        .from("attendance_events")
        .select("organization_id")
        .in("organization_id", ids)
        .gte("occurred_at", since),
      supabase
        .from("attendance_events")
        .select("organization_id")
        .in("organization_id", ids)
        .eq("status", "pending_review"),
    ]);

  const roomDept = new Map(
    (
      (roomsRes.data ?? []) as {
        id: string;
        organization_id: string;
        department_id: string;
      }[]
    ).map((r) => [r.id, r.department_id])
  );
  const sessions = (sessRes.data ?? []) as unknown as Sess[];
  const depts = (deptsRes.data ?? []) as unknown as OrgRow[];
  const recent = (recentRes.data ?? []) as unknown as OrgRow[];
  const pendingRows = (pendingRes.data ?? []) as unknown as OrgRow[];
  const now = Date.now();
  const t = (iso: string) => new Date(iso).getTime();

  return (
    <main className="page max-w-4xl">
      <h1 className="text-2xl font-semibold">
        Welcome, {name ?? user?.email}
      </h1>
      <Suspense fallback={null}>
        <ProfileNotice />
           <InstallApp />
      </Suspense>

      {memberships.length === 0 && (
        <section className="neu-card mt-6 flex flex-col gap-3">
          <h2 className="text-lg font-medium">You are not in an organization yet</h2>
          <p className="muted text-sm">
            Ask your administrator to add your email address. To register your
            own organization, sign out and use the Register tab on the sign-in
            page.
          </p>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {memberships.map((m) => {
          const o = m.organizations!;
          const isAdmin = m.role === "org_admin";
          const mine = dms.filter((d) => d.organization_id === o.id);
          const manager = isAdmin || mine.some((d) => d.role !== "user");
          const myDepts = new Set(mine.map((d) => d.department_id));
          const labels = [
            ...new Set([
              ...(isAdmin ? ["Platform admin"] : []),
              ...mine.map((d) => deptRoleText(o.org_type, d.role, d.title)),
            ]),
          ];
          const orgSessions = sessions.filter((s) => s.organization_id === o.id);
          const joinable = orgSessions.filter((s) =>
            myDepts.has(roomDept.get(s.room_id) ?? "")
          );
          const isLive = (s: Sess) => t(s.starts_at) <= now && t(s.expires_at) >= now;
          const live = joinable.filter(isLive);
          const coming = joinable.filter((s) => t(s.starts_at) > now).slice(0, 3);
          const liveCount = orgSessions.filter(isLive).length;
          const pending = count(pendingRows, o.id);

          return (
            <section key={o.id} className="neu-card flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{o.name}</h2>
                <span className="flex flex-wrap gap-2">
                  {labels.map((l) => (
                    <span key={l} className="neu-badge badge-blue">
                      {l}
                    </span>
                  ))}
                  <span
                    className={`neu-badge ${
                      o.status === "active"
                        ? "badge-ok"
                        : o.status === "suspended"
                        ? "badge-bad"
                        : "badge-warn"
                    }`}
                  >
                    {o.status}
                  </span>
                </span>
              </div>

              {o.status !== "active" ? (
                <p className="alert alert-warn">
                  This organization is not active. It is either waiting for
                  approval or has been suspended.
                </p>
              ) : (
                <>
                  {manager && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat label="Departments" value={count(depts, o.id)} />
                      <Stat
                        label="Sessions live now"
                        value={liveCount}
                        tone={liveCount > 0 ? "text-ok" : ""}
                      />
                      <Stat label="Records, last 24h" value={count(recent, o.id)} />
                      <Stat
                        label="Pending review"
                        value={pending}
                        tone={pending > 0 ? "text-warn" : ""}
                      />
                    </div>
                  )}

                  {myDepts.size > 0 && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-sm font-semibold">Live now</h3>
                      {live.length === 0 && (
                        <p className="neu-inset muted text-sm">
                          Nothing is live right now.
                        </p>
                      )}
                      {live.map((s) => (
                        <div
                          key={s.id}
                          className="neu-raised flex flex-wrap items-center justify-between gap-3"
                        >
                          <span>
                            <span className="block font-medium">{s.title}</span>
                            <span className="muted text-sm">
                              until {fmt(s.expires_at, o.timezone)}
                            </span>
                          </span>
                          <Link
                            href={`/s/${s.token}`}
                            className="neu-btn neu-btn-success"
                          >
                            Join
                          </Link>
                        </div>
                      ))}
                      {coming.length > 0 && (
                        <>
                          <h3 className="mt-2 text-sm font-semibold">Coming up</h3>
                          {coming.map((s) => (
                            <div key={s.id} className="neu-inset text-sm">
                              <span className="font-medium">{s.title}</span>
                              <span className="muted">
                                {" "}
                                · {fmt(s.starts_at, o.timezone)}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/org/${o.id}/sessions`}
                      className="neu-btn neu-btn-primary"
                    >
                      Sessions
                    </Link>
                    <Link href={`/org/${o.id}/reports`} className="neu-btn">
                      Reports
                    </Link>
                    {manager && (
                      <Link href={`/org/${o.id}`} className="neu-btn">
                        Departments
                      </Link>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {false && (
        <div className="mt-8">
          <Link href="/superadmin" className="neu-btn">
            Superadmin
          </Link>
        </div>
      )}
    </main>
  );
}