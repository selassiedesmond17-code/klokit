import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { siteUrl } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/badges";
import SubmitButton from "@/components/submit-button";

type Ev = {
  id: string;
  user_id: string;
  action: string;
  status: string;
  occurred_at: string;
  admin_approved?: boolean;
};

const AUDIT_LABELS: Record<string, { text: string; color: string }> = {
  time_corrected: { text: "Time corrected", color: "badge-blue" },
  missing_clock_out_added: { text: "Missing clock-out added", color: "badge-ok" },
  review_approved: { text: "Review approved", color: "badge-ok" },
     review_rejected: { text: "Review rejected", color: "badge-bad" },
     record_voided: { text: "Record voided", color: "badge-bad" },
};

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toLocalInput(iso: string, tz: string) {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: tz })
    .replace(" ", "T")
    .slice(0, 16);
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; roomId: string; sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgId, roomId, sessionId } = await params;
  const { error } = await searchParams;
  const base = `/org/${orgId}/rooms/${roomId}/sessions`;
  const path = `${base}/${sessionId}`;
  const supabase = await createClient();

  const { data: canManage } = await supabase.rpc("can_manage_room", {
    p_room: roomId,
  });
  if (!canManage) notFound();

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select(
      "id, title, token, starts_at, expires_at, allow_clock_in, allow_clock_out, require_gps, gps_notice, series_id"
    )
    .eq("id", sessionId)
    .eq("room_id", roomId)
    .eq("organization_id", orgId)
    .single();
     if (!session) notFound();

     let seriesCount = 0;
     if (session.series_id) {
       const { count } = await supabase
         .from("attendance_sessions")
         .select("id", { count: "exact", head: true })
         .eq("series_id", session.series_id);
       seriesCount = count ?? 0;
     }

  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  const tz = org?.timezone ?? "UTC";

  const { data: members } = await supabase
    .from("room_members")
    .select("user_id, email, role")
    .eq("room_id", roomId)
    .order("created_at");

  const { data: events } = await supabase
    .from("attendance_events")
    .select("id, user_id, action, status, occurred_at, admin_approved")
    .eq("session_id", sessionId);

  const { data: audit } = await supabase
    .from("attendance_audit")
    .select(
      "id, changed_by_email, changed_at, reason, change_type, old_values, new_values"
    )
    .eq("session_id", sessionId)
    .order("changed_at", { ascending: false });

  // The QR code contains only the session link, nothing personal
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
     const link = `${await siteUrl()}/s/${session.token}`;
  const qrSvg = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    width: 240,
  });

  const byUser = new Map<string, { in?: Ev; out?: Ev }>();
  for (const e of (events ?? []) as Ev[]) {
    if (e.status === "rejected" || e.status === "voided") continue;
    const row = byUser.get(e.user_id) ?? {};
    if (e.action === "clock_in") row.in = e;
    else row.out = e;
    byUser.set(e.user_id, row);
  }

  const now = Date.now();
  const ended = now > new Date(session.expires_at).getTime();
  const upcoming = now < new Date(session.starts_at).getTime();

  async function toggle(formData: FormData) {
    "use server";
    const field = String(formData.get("field"));
    if (field !== "allow_clock_in" && field !== "allow_clock_out") return;
    const value = formData.get("value") === "true";
    const supabase = await createClient();
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ [field]: value })
      .eq("id", sessionId);
    if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    redirect(path);
  }

  async function endNow() {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    redirect(path);
  }

  async function correct(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.rpc("correct_event", {
      p_event: String(formData.get("event_id")),
      p_new_local: String(formData.get("new_time")),
      p_reason: String(formData.get("reason") ?? ""),
    });
    if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    redirect(path);
  }

  async function addClockOut(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_missing_clock_out", {
      p_session: sessionId,
      p_user: String(formData.get("user_id")),
      p_local: String(formData.get("new_time")),
      p_reason: String(formData.get("reason") ?? ""),
    });
    if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    redirect(path);
  }

     async function saveNotice(formData: FormData) {
       "use server";
       const notice = String(formData.get("notice") ?? "").trim().slice(0, 300);
       const supabase = await createClient();
       const { error } = await supabase
         .from("attendance_sessions")
         .update({ gps_notice: notice || null })
         .eq("id", sessionId);
       if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
       redirect(path);
     }

          async function voidRecord(formData: FormData) {
       "use server";
       const supabase = await createClient();
       const { error } = await supabase.rpc("void_event", {
         p_event: String(formData.get("event_id")),
         p_reason: String(formData.get("reason") ?? ""),
       });
       if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
       redirect(path);
     }

     const evCell = (ev?: Ev) =>
    ev ? (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span>{fmt(ev.occurred_at, tz)}</span>
   {ev.status !== "recorded" && <StatusBadge status={ev.status} />}
             {ev.admin_approved && (
               <span className="neu-badge badge-blue">admin-approved</span>
             )}          
        </div>
        <details className="neu-details text-sm">
          <summary>Correct</summary>
          <form action={correct} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="event_id" value={ev.id} />
            <input
              type="datetime-local"
              name="new_time"
              required
              defaultValue={toLocalInput(ev.occurred_at, tz)}
              className="neu-input"
            />
            <input
              name="reason"
              required
              placeholder="Reason"
              aria-label="Reason for correction"
              className="neu-input"
            />
            <button className="neu-btn neu-btn-sm neu-btn-primary">
                 Save correction
               </button>
               <button
                 formAction={voidRecord}
                 formNoValidate
                 className="neu-btn neu-btn-sm neu-btn-danger"
               >
                 Void this record
            </button>
          </form>
        </details>
      </div>
    ) : (
      <span className="muted">—</span>
    );

  return (
    <main className="page max-w-4xl">

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        {ended ? (
          <span className="neu-badge">Ended</span>
        ) : upcoming ? (
          <span className="neu-badge badge-blue">Upcoming</span>
        ) : (
          <span className="neu-badge badge-ok">Open now</span>
        )}
      </div>
      <p className="muted mt-1 text-sm">
        {fmt(session.starts_at, tz)} → {fmt(session.expires_at, tz)} ({tz})
      </p>
      {error && <p className="alert alert-error mt-4">{error}</p>}
         {seriesCount > 1 && (
           <p className="alert alert-info mt-4">
             This session is one of {seriesCount} in a repeating series. They
             all share this QR code, which always opens whichever session is
             live that day.
           </p>
         )}

         <div className="mt-4 flex flex-wrap items-center gap-3">
           <span className={`neu-badge ${session.require_gps ? "badge-ok" : ""}`}>
             Location check: {session.require_gps ? "on" : "off"}
           </span>
         </div>
         <form action={saveNotice} className="neu-card mt-4 flex flex-col gap-3">
           <label className="field">
             Notice for users (shown on the clock page, for example a known
             GPS problem today)
             <textarea
               name="notice"
               rows={2}
               maxLength={300}
               defaultValue={session.gps_notice ?? ""}
               className="neu-input mt-1"
             />
           </label>
           <p className="muted text-xs">
             A notice only warns people. It never approves anyone&apos;s
             attempt automatically.
           </p>
           <SubmitButton
             className="neu-btn neu-btn-sm neu-btn-primary w-fit"
             pendingText="Saving…"
           >
             Save notice
           </SubmitButton>
         </form>

      <section className="neu-card mt-6 flex flex-wrap gap-8">
        <div>
          <div
            className="neu-qr"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
             <p className="muted mt-2 max-w-60 break-all text-xs">{link}</p>
             <div className="mt-3 flex flex-wrap gap-2">
               <a href={`${path}/qr?format=png`} download className="neu-btn neu-btn-sm">
                 Download PNG
               </a>
               <a href={`${path}/qr?format=pdf`} download className="neu-btn neu-btn-sm neu-btn-primary">
                 Download PDF
               </a>
             </div>
        </div>
        <div className="flex flex-col gap-3">
          <form action={toggle}>
            <input type="hidden" name="field" value="allow_clock_in" />
            <input
              type="hidden"
              name="value"
              value={String(!session.allow_clock_in)}
            />
            <button className="neu-btn neu-btn-sm">
              {session.allow_clock_in ? "Close clock-in" : "Open clock-in"}
            </button>
          </form>
          <form action={toggle}>
            <input type="hidden" name="field" value="allow_clock_out" />
            <input
              type="hidden"
              name="value"
              value={String(!session.allow_clock_out)}
            />
            <button className="neu-btn neu-btn-sm">
              {session.allow_clock_out ? "Close clock-out" : "Open clock-out"}
            </button>
          </form>
          {!ended && (
            <form action={endNow}>
              <button className="neu-btn neu-btn-sm neu-btn-danger">
                End session now
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="neu-card mt-6">
        <h2 className="text-lg font-medium">Attendance</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="neu-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Clock in</th>
                <th>Clock out</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No one is in this room yet.
                  </td>
                </tr>
              )}
              {(members ?? []).map((m) => {
                const row = byUser.get(m.user_id) ?? {};
                return (
                  <tr key={m.user_id}>
                    <td className="break-all">{m.email ?? "Unknown"}</td>
                    <td>{evCell(row.in)}</td>
                    <td>
                      {row.out ? (
                        evCell(row.out)
                      ) : row.in ? (
                        <div className="flex flex-col gap-1">
                          {ended && (
                            <span className="neu-badge badge-bad w-fit">
                              Missing clock-out
                            </span>
                          )}
                          <details className="neu-details text-sm">
                            <summary>Add clock-out</summary>
                            <form
                              action={addClockOut}
                              className="mt-2 flex flex-col gap-2"
                            >
                              <input
                                type="hidden"
                                name="user_id"
                                value={m.user_id}
                              />
                              <input
                                type="datetime-local"
                                name="new_time"
                                required
                                defaultValue={toLocalInput(
                                  session.expires_at,
                                  tz
                                )}
                                className="neu-input"
                              />
                              <input
                                name="reason"
                                required
                                placeholder="Reason"
                                aria-label="Reason for adding clock-out"
                                className="neu-input"
                              />
                              <button className="neu-btn neu-btn-sm neu-btn-primary">
                                Save
                              </button>
                            </form>
                          </details>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="neu-card mt-6">
        <h2 className="text-lg font-medium">Correction history</h2>
        <ul className="mt-3 flex flex-col gap-4 text-sm">
          {(audit ?? []).length === 0 && (
            <li className="neu-inset muted">No corrections.</li>
          )}
          {(audit ?? []).map((a) => {
            const label = AUDIT_LABELS[a.change_type as string] ?? {
              text: "Change",
              color: "",
            };
            return (
              <li key={a.id} className="neu-inset flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`neu-badge ${label.color}`}>
                    {label.text}
                  </span>
                  <span className="muted">
                    by {a.changed_by_email} · {fmt(a.changed_at, tz)}
                  </span>
                </div>
                <div>
                  {a.old_values?.occurred_at
                    ? fmt(a.old_values.occurred_at, tz)
                    : "none"}{" "}
                  → {fmt(a.new_values.occurred_at, tz)}
                </div>
                <div className="muted">Reason: {a.reason}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}