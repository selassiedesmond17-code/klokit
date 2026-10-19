import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/report-filters";
import { fieldLabel } from "@/lib/org-types";
import {
  FIELD_FILTER_PARAM,
  FILTER_KEYS,
  REPORT_STATUSES,
  STATUS_LABELS,
  parseMatrixFilters,
  shownFields,
  type MatrixRow,
} from "@/lib/report-matrix";

// One cell under "Clock in" or "Clock out"
function Mark({
  time,
  status,
  note,
  approved,
  empty,
}: {
  time: string | null;
  status: string | null;
  note: string | null;
  approved: boolean;
  empty: string;
}) {
  if (!status) {
    return (
      <span
        className={
          empty === "missing" ? "text-warn text-xs font-semibold" : "muted"
        }
      >
        {empty}
      </span>
    );
  }
  if (status === "recorded") {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <span className="text-ok font-semibold" aria-label="present">
          ✓
        </span>
        <span>{time}</span>
        {approved && (
          <span className="neu-badge badge-blue" title={note ?? undefined}>
            approved
          </span>
        )}
      </span>
    );
  }
  const tone =
    status === "corrected"
      ? "badge-blue"
      : status === "pending_review"
      ? "badge-warn"
      : "badge-bad";
  const word = status === "pending_review" ? "pending" : status;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1">
        {/* Hover to read the reason */}
        <span
          className={`neu-badge ${tone} cursor-help`}
          title={note ?? undefined}
        >
          {word}
        </span>
        {time && (status === "corrected" || status === "pending_review") && (
          <span className="muted text-xs">{time}</span>
        )}
      </span>
      {note && <span className="muted block text-xs sm:hidden">{note}</span>}
    </span>
  );
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) notFound();
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : null;
  };
  const filters = parseMatrixFilters(get);

  const supabase = await createClient();
  const [orgRes, deptRes, roomRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, timezone, org_type, profile_fields")
      .eq("id", orgId)
      .single(),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("rooms")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
  ]);
  const org = orgRes.data;
  if (!org) notFound();

  const shown = shownFields(org.profile_fields, org.org_type);
  const showId = shown.includes("id_number");
  const showPhone = shown.includes("phone");
  const extra = shown.filter((k) => k !== "id_number" && k !== "phone");
  const filterFields = shown.filter((k) => FIELD_FILTER_PARAM[k]);

  const { data, error } = await supabase.rpc("attendance_matrix", {
    p_org: orgId,
    ...filters,
    p_limit: 1000,
  });
  const rows = (data ?? []) as MatrixRow[];

  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = get(k);
    if (v) qs.set(k, v);
  }

  const depts = (deptRes.data ?? []) as { id: string; name: string }[];
  const rooms = (roomRes.data ?? []) as { id: string; name: string }[];
  const columns = 5 + (showId ? 1 : 0) + (showPhone ? 1 : 0) + (extra.length ? 1 : 0);

  return (
    <main className="page max-w-6xl">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="muted text-sm">
        {org.name} · times are shown in {org.timezone}. Hover over a coloured
        word to read the reason.
      </p>

      <form
        method="get"
        className="neu-card mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="field">
          From
          <input
            type="date"
            name="from"
            defaultValue={get("from") ?? ""}
            className="neu-input mt-1"
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            name="to"
            defaultValue={get("to") ?? ""}
            className="neu-input mt-1"
          />
        </label>
        <label className="field">
          Department
          <select
            name="dept"
            defaultValue={get("dept") ?? ""}
            className="neu-input mt-1"
          >
            <option value="">All departments</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Room
          <select
            name="room"
            defaultValue={get("room") ?? ""}
            className="neu-input mt-1"
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Name
          <input
            name="name"
            defaultValue={get("name") ?? ""}
            className="neu-input mt-1"
          />
        </label>
        <label className="field">
          Email
          <input
            name="email"
            defaultValue={get("email") ?? ""}
            className="neu-input mt-1"
          />
        </label>
        {filterFields.map((k) => {
          const param = FIELD_FILTER_PARAM[k]!;
          return (
            <label key={k} className="field">
              {fieldLabel(org.org_type, k, "user")}
              <input
                name={param}
                defaultValue={get(param) ?? ""}
                className="neu-input mt-1"
              />
            </label>
          );
        })}
        <label className="field">
          Status
          <select
            name="status"
            defaultValue={get("status") ?? ""}
            className="neu-input mt-1"
          >
            <option value="">All</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button className="neu-btn neu-btn-primary">Apply</button>
          <Link href={`/org/${orgId}/reports`} className="neu-btn">
            Clear
          </Link>
        </div>
      </form>

      {error && <p className="alert alert-error mt-4">{error.message}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">
          {rows.length} row{rows.length === 1 ? "" : "s"}
          {rows.length === 1000 &&
            " (showing the first 1000, narrow the filters)"}
        </p>
        <div className="flex gap-3">
          <a
            href={`/org/${orgId}/reports/export?${qs.toString()}`}
            className="neu-btn neu-btn-success"
          >
            Download CSV
          </a>
          <a
            href={`/org/${orgId}/reports/export/pdf?${qs.toString()}`}
            className="neu-btn neu-btn-primary"
          >
            Download PDF
          </a>
        </div>
      </div>

      <div className="neu-card mt-3 overflow-x-auto">
        <table className="neu-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Session</th>
              <th>Person</th>
              {showId && <th>{fieldLabel(org.org_type, "id_number", "user")}</th>}
              {showPhone && <th>Phone</th>}
              {extra.length > 0 && <th>Details</th>}
              <th>Clock in</th>
              <th>Clock out</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="muted">
                  No records match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.session_id}-${r.user_id}`}>
                <td className="whitespace-nowrap">{r.session_date}</td>
                <td>
                  <span className="font-medium">{r.session_title}</span>
                  <span className="muted block text-xs">{r.room_name}</span>
                </td>
                <td>
                  <span className="block break-words font-medium">
                    {r.full_name ?? r.email ?? "Unknown"}
                  </span>
                  {r.full_name && (
                    <span className="muted block break-all text-xs">
                      {r.email}
                    </span>
                  )}
                </td>
                {showId && <td>{r.id_number ?? "—"}</td>}
                {showPhone && (
                  <td className="whitespace-nowrap">{r.phone ?? "—"}</td>
                )}
                {extra.length > 0 && (
                  <td className="text-sm">
                    {extra
                      .map((k) => r[k])
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                )}
                <td>
                  <Mark
                    time={r.in_time}
                    status={r.in_status}
                    note={r.in_note}
                    approved={r.in_approved}
                    empty="—"
                  />
                </td>
                <td>
                  <Mark
                    time={r.out_time}
                    status={r.out_status}
                    note={r.out_note}
                    approved={r.out_approved}
                    empty={r.in_status ? "missing" : "—"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}