import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/report-filters";
import { fieldLabel } from "@/lib/org-types";
import {
  parseMatrixFilters,
  shownFields,
  type MatrixRow,
} from "@/lib/report-matrix";

// Wraps a value for CSV, and stops spreadsheet programs from running
// anything that looks like a formula
function csvCell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const filters = parseMatrixFilters((k) => url.searchParams.get(k));

  const supabase = await createClient();
  const [orgRes, res] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, org_type, profile_fields")
      .eq("id", orgId)
      .single(),
    supabase.rpc("attendance_matrix", {
      p_org: orgId,
      ...filters,
      p_limit: 5000,
    }),
  ]);
  if (!orgRes.data) return new NextResponse("Not found", { status: 404 });
  if (res.error) return new NextResponse(res.error.message, { status: 400 });

  const org = orgRes.data;
  const rows = (res.data ?? []) as MatrixRow[];
  const shown = shownFields(org.profile_fields, org.org_type);

  const header = [
    "Date",
    "Session",
    "Room",
    "Name",
    "Email",
    ...shown.map((k) => fieldLabel(org.org_type, k, "user")),
    "Clock in",
    "Clock in status",
    "Clock in note",
    "Clock out",
    "Clock out status",
    "Clock out note",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.session_date,
        r.session_title,
        r.room_name,
        r.full_name,
        r.email,
        ...shown.map((k) => r[k]),
        r.in_time,
        r.in_status ?? "absent",
        r.in_note,
        r.out_time,
        r.out_status ?? (r.in_status ? "missing" : "absent"),
        r.out_note,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="klokit-attendance-${stamp}.csv"`,
    },
  });
}