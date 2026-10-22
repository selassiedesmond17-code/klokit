import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import RepeatFields from "@/components/repeat-fields";

type Row = {
  id: string;
  title: string;
  starts_at: string;
  expires_at: string;
  series_id: string | null;
};

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; roomId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgId, roomId } = await params;
  const { error } = await searchParams;
  const base = `/org/${orgId}/rooms/${roomId}/sessions`;
  const supabase = await createClient();

  const { data: room } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("id", roomId)
    .eq("organization_id", orgId)
    .single();
  if (!room) notFound();

  const { data: canManage } = await supabase.rpc("can_manage_room", {
    p_room: roomId,
  });
  if (!canManage) notFound();

  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  const tz = org?.timezone ?? "UTC";

  const { data } = await supabase
    .from("attendance_sessions")
    .select("id, title, starts_at, expires_at, series_id")
    .eq("room_id", roomId)
    .order("starts_at", { ascending: false })
    .limit(400);
  const rows = (data ?? []) as Row[];

  const now = Date.now();
  const t = (iso: string) => new Date(iso).getTime();
  const live = rows.filter((s) => t(s.starts_at) <= now && t(s.expires_at) >= now);
  const upcomingAll = rows
    .filter((s) => t(s.starts_at) > now)
    .sort((a, b) => t(a.starts_at) - t(b.starts_at));
  const upcoming = upcomingAll.slice(0, 20);
  const past = rows.filter((s) => t(s.expires_at) < now).slice(0, 20);

  async function createSession(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const unit = String(formData.get("repeat_unit") ?? "none");
    const days = formData
      .getAll("weekday")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
    if (unit !== "none" && days.length === 0) {
      redirect(
        `${base}?error=${encodeURIComponent("Tick at least one day of the week")}`
      );
    }
    const { data, error } = await supabase.rpc("create_session", {
      p_room: roomId,
      p_title: String(formData.get("title") ?? ""),
      p_start_local: String(formData.get("start") ?? ""),
      p_end_local: String(formData.get("end") ?? ""),
      p_allow_in: formData.get("allow_in") === "on",
      p_allow_out: formData.get("allow_out") === "on",
      p_require_gps: formData.get("require_gps") === "on",
      p_notice: String(formData.get("notice") ?? ""),
      p_repeat_unit: unit,
      p_repeat_count: Number(formData.get("repeat_count") ?? 1) || 1,
      p_weekdays: days,
    });
    if (error) redirect(`${base}?error=${encodeURIComponent(error.message)}`);

    const { data: first } = await supabase
      .from("attendance_sessions")
      .select("series_id")
      .eq("id", data)
      .single();
    let made = 1;
    if (first?.series_id) {
      const { count } = await supabase
        .from("attendance_sessions")
        .select("id", { count: "exact", head: true })
        .eq("series_id", first.series_id);
      made = count ?? 1;
    }
    redirect(`${base}/${data}?made=${made}`);
  }

  const card = (s: Row, label: string, color: string) => (
    <li key={s.id}>
      <Link href={`${base}/${s.id}`} className="neu-row">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{s.title}</span>
          <span className="flex gap-2">
            {s.series_id && <span className="neu-badge">repeats</span>}
            <span className={`neu-badge ${color}`}>{label}</span>
          </span>
        </div>
        <div className="muted mt-1 text-sm">
          {fmt(s.starts_at, tz)} → {fmt(s.expires_at, tz)}
        </div>
      </Link>
    </li>
  );

  return (
    <main className="page max-w-2xl">
      <h1 className="text-2xl font-semibold">Attendance sessions</h1>
      <p className="muted text-sm">{room.name}</p>

      <section className="neu-card mt-6">
        <h2 className="text-lg font-medium">New session</h2>
        <p className="muted mt-1 text-sm">
          Times are in the organization&apos;s time zone ({tz}).
        </p>
        <form action={createSession} className="mt-4 flex flex-col gap-4">
          <input
            name="title"
            required
            placeholder="Title, e.g. Morning shift"
            aria-label="Session title"
            className="neu-input"
          />
          <label className="field">
            Starts
            <input
              type="datetime-local"
              name="start"
              required
              className="neu-input mt-1"
            />
          </label>
          <label className="field">
            Ends (session expires)
            <input
              type="datetime-local"
              name="end"
              required
              className="neu-input mt-1"
            />
          </label>
          <label className="field flex items-center gap-2">
            <input type="checkbox" name="allow_in" defaultChecked /> Clock-in
            allowed
          </label>
          <label className="field flex items-center gap-2">
            <input type="checkbox" name="allow_out" defaultChecked /> Clock-out
            allowed
          </label>
          <label className="field flex items-center gap-2">
            <input type="checkbox" name="require_gps" /> Check location (GPS)
            when clocking
          </label>
          <label className="field">
            Notice for users (optional)
            <textarea
              name="notice"
              rows={2}
              maxLength={300}
              placeholder="For example: GPS is weak inside the hall today"
              className="neu-input mt-1"
            />
          </label>

          <RepeatFields />

          <SubmitButton
            className="neu-btn neu-btn-primary"
            pendingText="Creating…"
          >
            Create session
          </SubmitButton>
        </form>
        {error && <p className="alert alert-error mt-4">{error}</p>}
      </section>

      {live.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-medium">Live now</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {live.map((s) => card(s, "Live now", "badge-ok"))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-lg font-medium">Upcoming</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {upcoming.length === 0 && (
          <li className="neu-inset muted">No upcoming sessions.</li>
        )}
        {upcoming.map((s) => card(s, "Upcoming", "badge-blue"))}
        {upcomingAll.length > upcoming.length && (
          <li className="muted text-sm">
            …and {upcomingAll.length - upcoming.length} more later
          </li>
        )}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Recently ended</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {past.length === 0 && (
          <li className="neu-inset muted">No ended sessions yet.</li>
        )}
        {past.map((s) => card(s, "Ended", ""))}
      </ul>
    </main>
  );
}