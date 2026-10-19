import { NextResponse, type NextRequest } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/report-filters";
import { fieldLabel } from "@/lib/org-types";
import {
  parseMatrixFilters,
  shownFields,
  type MatrixRow,
} from "@/lib/report-matrix";

const GREEN = rgb(0.09, 0.5, 0.24);
const BLUE = rgb(0.11, 0.31, 0.85);
const AMBER = rgb(0.57, 0.25, 0.05);
const RED = rgb(0.72, 0.11, 0.11);
const GRAY = rgb(0.45, 0.47, 0.5);
const INK = rgb(0.1, 0.12, 0.16);

// The standard PDF fonts only cover basic Latin letters: anything else prints as "?"
const safe = (v: unknown) =>
  String(v ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > width) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) <= width) line = t;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clockCell(
  time: string | null,
  status: string | null,
  approved: boolean,
  hasIn: boolean
) {
  if (!status) {
    return hasIn
      ? { text: "missing", color: AMBER }
      : { text: "-", color: GRAY };
  }
  if (status === "recorded") {
    return { text: approved ? `${time} (approved)` : `${time}`, color: GREEN };
  }
  if (status === "corrected") {
    return { text: `corrected ${time ?? ""}`.trim(), color: BLUE };
  }
  if (status === "pending_review") {
    return { text: `pending ${time ?? ""}`.trim(), color: AMBER };
  }
  return { text: status, color: RED };
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
      .select("name, timezone, org_type, profile_fields")
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

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842;
  const H = 595;
  const M = 28;
  const ROW = 16;
  const SIZE = 8;
  const LH = 11;

  type Col = { title: string; w: number; get: (r: MatrixRow) => string };
  const cols: Col[] = [
    { title: "Date", w: 56, get: (r) => r.session_date },
    {
      title: "Session",
      w: 130,
      get: (r) => `${r.session_title} - ${r.room_name}`,
    },
    { title: "Person", w: 135, get: (r) => r.full_name ?? r.email ?? "" },
  ];
  if (shown.includes("id_number")) {
    cols.push({
      title: fieldLabel(org.org_type, "id_number", "user"),
      w: 70,
      get: (r) => r.id_number ?? "",
    });
  }
  if (shown.includes("phone")) {
    cols.push({ title: "Phone", w: 80, get: (r) => r.phone ?? "" });
  }
  const extra = shown.filter((k) => k !== "id_number" && k !== "phone");
  if (extra.length) {
    cols.push({
      title: "Details",
      w: 110,
      get: (r) =>
        extra
          .map((k) => r[k])
          .filter(Boolean)
          .join(" / "),
    });
  }
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  const clockW = Math.max(70, (W - 2 * M - fixed) / 2);
  const headerCols = [
    ...cols.map((c) => ({ title: c.title, w: c.w })),
    { title: "Clock in", w: clockW },
    { title: "Clock out", w: clockW },
  ];

  const stamp = new Date().toLocaleString("en-GB", {
    timeZone: org.timezone ?? "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const used = [
    "from",
    "to",
    "status",
    "name",
    "email",
    "phone",
    "id",
    "class",
    "group",
    "level",
    "department",
  ]
    .filter((k) => url.searchParams.get(k))
    .map((k) => `${k}: ${url.searchParams.get(k)}`);
  const filterText = used.length
    ? `Filters - ${used.join("; ")}`
    : "No filters: everything you are allowed to see";

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  function startPage(withTable: boolean) {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (pages.length === 1) {
      page.drawText("KlokIt attendance report", {
        x: M,
        y: y - 14,
        size: 15,
        font: bold,
        color: INK,
      });
      page.drawText(
        fit(`${org.name}  -  generated ${stamp}`, font, 9, W - 2 * M),
        { x: M, y: y - 30, size: 9, font, color: GRAY }
      );
      page.drawText(fit(filterText, font, 8, W - 2 * M), {
        x: M,
        y: y - 42,
        size: 8,
        font,
        color: GRAY,
      });
      y -= 56;
    }
    if (withTable) {
      page.drawRectangle({
        x: M,
        y: y - ROW,
        width: W - 2 * M,
        height: ROW,
        color: rgb(0.88, 0.9, 0.93),
      });
      let x = M + 3;
      for (const c of headerCols) {
        page.drawText(fit(c.title, bold, SIZE, c.w - 6), {
          x,
          y: y - 11,
          size: SIZE,
          font: bold,
          color: INK,
        });
        x += c.w;
      }
      y -= ROW;
    }
  }

  startPage(true);
  if (rows.length === 0) {
    page.drawText("No records match.", {
      x: M + 3,
      y: y - 11,
      size: SIZE + 1,
      font,
      color: GRAY,
    });
    y -= ROW;
  }
  rows.forEach((r, i) => {
    if (y - ROW < M + 16) startPage(true);
    if (i % 2 === 1) {
      page.drawRectangle({
        x: M,
        y: y - ROW,
        width: W - 2 * M,
        height: ROW,
        color: rgb(0.96, 0.97, 0.98),
      });
    }
    let x = M + 3;
    for (const c of cols) {
      page.drawText(fit(c.get(r), font, SIZE, c.w - 6), {
        x,
        y: y - 11,
        size: SIZE,
        font,
        color: INK,
      });
      x += c.w;
    }
    const ci = clockCell(r.in_time, r.in_status, r.in_approved, false);
    page.drawText(fit(ci.text, font, SIZE, clockW - 6), {
      x,
      y: y - 11,
      size: SIZE,
      font,
      color: ci.color,
    });
    x += clockW;
    const co = clockCell(
      r.out_time,
      r.out_status,
      r.out_approved,
      Boolean(r.in_status)
    );
    page.drawText(fit(co.text, font, SIZE, clockW - 6), {
      x,
      y: y - 11,
      size: SIZE,
      font,
      color: co.color,
    });
    y -= ROW;
  });

  // The reasons, printed in full (paper cannot show a hover)
  const notes: string[] = [];
  for (const r of rows) {
    const who = r.full_name ?? r.email ?? "Unknown";
    if (r.in_note) notes.push(`${r.session_date}  ${who}  -  Clock in: ${r.in_note}`);
    if (r.out_note) notes.push(`${r.session_date}  ${who}  -  Clock out: ${r.out_note}`);
  }
  if (notes.length) {
    if (y - 40 < M + 16) startPage(false);
    y -= 14;
    page.drawText("Notes and reasons", {
      x: M,
      y: y - 10,
      size: 10,
      font: bold,
      color: INK,
    });
    y -= 20;
    for (const n of notes.slice(0, 400)) {
      for (const line of wrap(n, font, SIZE, W - 2 * M)) {
        if (y - LH < M + 16) startPage(false);
        page.drawText(line, { x: M, y: y - 9, size: SIZE, font, color: INK });
        y -= LH;
      }
    }
  }

  pages.forEach((p, i) => {
    p.drawText("KlokIt", { x: M, y: 12, size: 8, font: bold, color: GRAY });
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, {
      x: W - M - font.widthOfTextAtSize(t, 8),
      y: 12,
      size: 8,
      font,
      color: GRAY,
    });
  });

  const bytes = await pdf.save();
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="klokit-attendance-${day}.pdf"`,
    },
  });
}