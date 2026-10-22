import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/badges";
import SubmitButton from "@/components/submit-button";
import ClockButtons from "./clock-buttons";

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ClockPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; done?: string; pending?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session } = await supabase
    .rpc("session_for_token", { p_token: token })
    .select(
      "id, title, starts_at, expires_at, allow_clock_in, allow_clock_out, room_id, organization_id, require_gps, gps_notice"
    )
    .eq("token", token)
    .maybeSingle();

  if (!session) {
    return (
      <main className="page max-w-md">
        <div className="neu-card flex flex-col gap-4">
          <h1 className="text-xl font-semibold">Session not available</h1>
          <p className="alert alert-warn">
            We could not open this session. Make sure you are signed in with
            the email address that was added to this room.
          </p>
          <p className="muted text-sm">Signed in as {user?.email}</p>
          <Link href="/" className="neu-btn">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const [roomRes, orgRes, mineRes] = await Promise.all([
    supabase.from("rooms").select("name").eq("id", session.room_id).single(),
    supabase
      .from("organizations")
      .select("name, timezone")
      .eq("id", session.organization_id)
      .single(),
    supabase
      .from("attendance_events")
      .select("id, action, status, occurred_at, review_note, admin_approved")
      .eq("session_id", session.id)
      .eq("user_id", user!.id),
  ]);
       const room = roomRes.data;
     const { data: missing } = await supabase.rpc("my_missing_profile", {
       p_org: session.organization_id,
     });
     const profileIncomplete = Array.isArray(missing) && missing.length > 0;
  const org = orgRes.data;
  const tz = org?.timezone ?? "UTC";

  const active = (mineRes.data ?? []).filter(
    (e) => e.status !== "rejected" && e.status !== "voided"
  );
  const myIn = active.find((e) => e.action === "clock_in");
  const myOut = active.find((e) => e.action === "clock_out");
  const waiting = active.filter((e) => e.status === "pending_review");

  const now = Date.now();
  const open =
    now >= new Date(session.starts_at).getTime() &&
    now <= new Date(session.expires_at).getTime();
     const canIn = open && session.allow_clock_in && !myIn && !profileIncomplete;
     const canOut =
       open && session.allow_clock_out && !!myIn && !myOut && !profileIncomplete;

  async function clock(formData: FormData) {
    "use server";
    const action =
      formData.get("action") === "clock_out" ? "clock_out" : "clock_in";
    const num = (key: string) => {
      const v = String(formData.get(key) ?? "").trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("clock_action", {
      p_token: token,
      p_action: action,
      p_lat: num("lat"),
      p_lng: num("lng"),
      p_accuracy: num("acc"),
    });
    if (error) redirect(`/s/${token}?error=${encodeURIComponent(error.message)}`);
    const r = data as { result: string; message: string };
    const key =
      r.result === "recorded"
        ? "done"
        : r.result === "pending_review"
        ? "pending"
        : "error";
    redirect(`/s/${token}?${key}=${encodeURIComponent(r.message)}`);
  }

  async function requestReview(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_review", {
      p_event: String(formData.get("event_id")),
      p_note: String(formData.get("note") ?? ""),
    });
    redirect(
      `/s/${token}?${
        error
          ? `error=${encodeURIComponent(error.message)}`
          : `done=${encodeURIComponent("Review requested")}`
      }`
    );
  }

  return (
    <main className="page max-w-md">
      <div className="neu-card flex flex-col gap-4">
        <div>
          <p className="muted text-sm">
            {org?.name} · {room?.name}
          </p>
          <h1 className="text-2xl font-semibold">{session.title}</h1>
          <p className="muted mt-1 text-sm">
            {fmt(session.starts_at, tz)} → {fmt(session.expires_at, tz)}
          </p>
          <p className="muted mt-1 text-xs">Signed in as {user?.email}</p>
        </div>

        {session.gps_notice && (
          <p className="alert alert-warn">
            <strong>Notice:</strong> {session.gps_notice}
          </p>
        )}
        {session.require_gps && (
          <p className="alert alert-info">
            This session checks your location. Allow location access when your
            browser asks.
          </p>
        )}

        {sp.done && <p className="alert alert-ok">{sp.done} ✓</p>}
        {sp.pending && <p className="alert alert-warn">{sp.pending}</p>}
        {sp.error && <p className="alert alert-error">{sp.error}</p>}

        <div className="neu-inset flex flex-col gap-2 text-sm">
          {(
            [
              ["Clock in", myIn],
              ["Clock out", myOut],
            ] as const
          ).map(([label, ev]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="muted">{label}</span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                {ev ? fmt(ev.occurred_at, tz) : "not yet"}
                {ev && ev.status !== "recorded" && (
                  <StatusBadge status={ev.status} />
                )}
                {ev?.admin_approved && (
                  <span className="neu-badge badge-blue">admin-approved</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {waiting.map((e) => (
          <div key={e.id} className="neu-inset flex flex-col gap-3">
            <div className="text-sm font-medium">
              {e.action === "clock_in" ? "Clock in" : "Clock out"} waiting for
              review
            </div>
            <p className="muted text-sm">
              We could not confirm your location. Your attempt time (
              {fmt(e.occurred_at, tz)}) is saved.
            </p>
            {e.review_note ? (
              <>
                <p className="alert alert-info">
                  Review requested. An admin will decide soon.
                </p>
                <p className="muted text-sm">Your explanation: {e.review_note}</p>
              </>
            ) : (
              <form action={requestReview} className="flex flex-col gap-3">
                <input type="hidden" name="event_id" value={e.id} />
                <textarea
                  name="note"
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  placeholder="What happened? For example: I am inside the building and my GPS is weak."
                  aria-label="Explanation for the review"
                  className="neu-input"
                />
                <SubmitButton
                  className="neu-btn neu-btn-primary"
                  pendingText="Sending…"
                >
                  Request review
                </SubmitButton>
              </form>
            )}
          </div>
        ))}

           {profileIncomplete && (
             <p className="alert alert-warn">
               Please complete your profile before clocking in or out.{" "}
               <Link
                 href={`/org/${session.organization_id}/profile`}
                 className="neu-link"
               >
                 Open my profile
               </Link>
             </p>
           )}
           <ClockButtons
          clock={clock}
          requireGps={session.require_gps}
          canIn={canIn}
          canOut={canOut}
        />
        {!open && (
          <p className="alert alert-info">
            This session is not open right now.
          </p>
        )}
      </div>
    </main>
  );
}