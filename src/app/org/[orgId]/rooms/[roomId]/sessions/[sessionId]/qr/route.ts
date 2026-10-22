import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/report-filters";
import { siteUrl } from "@/lib/mail";

const INK = rgb(0.1, 0.15, 0.24);
const GREEN = rgb(0.1, 0.72, 0.52);
const GRAY = rgb(0.4, 0.43, 0.48);

// The standard PDF fonts only cover basic Latin letters: anything else prints as "?"
const safe = (v: unknown) =>
  String(v ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

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

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; roomId: string; sessionId: string }> }
) {
  const { orgId, roomId, sessionId } = await params;
  if (![orgId, roomId, sessionId].every((v) => UUID_RE.test(v))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const format =
    new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "png";

  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("can_manage_room", {
    p_room: roomId,
  });
  if (!canManage) return new NextResponse("Not found", { status: 404 });

  const [sessRes, roomRes, orgRes] = await Promise.all([
    supabase
      .from("attendance_sessions")
      .select("id, title, token, starts_at, expires_at, series_id")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .eq("organization_id", orgId)
      .single(),
    supabase.from("rooms").select("name").eq("id", roomId).single(),
    supabase
      .from("organizations")
      .select("name, timezone")
      .eq("id", orgId)
      .single(),
  ]);
  const s = sessRes.data;
  if (!s || !roomRes.data || !orgRes.data) {
    return new NextResponse("Not found", { status: 404 });
  }
  const tz = orgRes.data.timezone ?? "UTC";

  // The code always carries the public address, never localhost
  const site = await siteUrl();
  const link = `${site}/s/${s.token}`;
  const png = await QRCode.toBuffer(link, {
    type: "png",
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  const fileName =
    String(s.title)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "session";

  if (format === "png") {
    return new NextResponse(new Uint8Array(png) as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="klokit-qr-${fileName}.png"`,
      },
    });
  }

  // ---------- PDF poster ----------
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });

  let when = `${fmtDate(s.starts_at)}   ${fmtTime(s.starts_at)} - ${fmtTime(s.expires_at)}`;
  let extra = "";
  if (s.series_id) {
    const { data: series } = await supabase
      .from("attendance_sessions")
      .select("starts_at")
      .eq("series_id", s.series_id)
      .order("starts_at");
    const list = (series ?? []) as { starts_at: string }[];
    if (list.length > 1) {
      when = `Every session ${fmtTime(s.starts_at)} - ${fmtTime(s.expires_at)}`;
      extra = `Repeats from ${fmtDate(list[0].starts_at)} to ${fmtDate(
        list[list.length - 1].starts_at
      )} (${list.length} sessions). The same code works every day.`;
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const page = pdf.addPage([W, H]);
  const center = (t: string, size: number, f: PDFFont, y: number, color = INK) => {
    const text = safe(t);
    page.drawText(text, {
      x: (W - f.widthOfTextAtSize(text, size)) / 2,
      y,
      size,
      font: f,
      color,
    });
  };

  let y = H - 56;
  try {
    const r = await fetch(`${site}/logo-light.png`);
    if (r.ok) {
      const logo = await pdf.embedPng(new Uint8Array(await r.arrayBuffer()));
      page.drawImage(logo, { x: (W - 64) / 2, y: y - 64, width: 64, height: 64 });
      y -= 74;
    }
  } catch {
    // no logo: carry on without it
  }
  center("Klok", 20, bold, y - 6);
  const kw = bold.widthOfTextAtSize("Klok", 20);
  const iw = bold.widthOfTextAtSize("It", 20);
  page.drawText("It", {
    x: (W - kw - iw) / 2 + kw,
    y: y - 6,
    size: 20,
    font: bold,
    color: GREEN,
  });
  y -= 44;

  center(orgRes.data.name, 14, font, y, GRAY);
  y -= 40;
  for (const line of wrap(s.title, bold, 30, W - 100).slice(0, 3)) {
    center(line, 30, bold, y);
    y -= 36;
  }
  center(roomRes.data.name, 16, font, y, GRAY);
  y -= 22;
  center(when, 13, font, y);
  y -= 18;
  if (extra) {
    for (const line of wrap(extra, font, 10, W - 120)) {
      center(line, 10, font, y, GRAY);
      y -= 13;
    }
  }

  y -= 26;
  center("Scan to clock in or out", 22, bold, y, INK);
  const qrImg = await pdf.embedPng(png);
  const qrSize = 340;
  y -= qrSize + 18;
  page.drawImage(qrImg, { x: (W - qrSize) / 2, y, width: qrSize, height: qrSize });

  y -= 26;
  center(
    "1. Scan the code with your phone camera    2. Sign in with your registered email",
    10,
    font,
    y,
    GRAY
  );
  y -= 14;
  center("3. Tap Clock in when you arrive and Clock out when you leave", 10, font, y, GRAY);
  y -= 22;
  center(link, 8, font, y, GRAY);
  center("KlokIt", 9, bold, 28, GRAY);

  const bytes = await pdf.save();
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="klokit-qr-${fileName}.pdf"`,
    },
  });
}