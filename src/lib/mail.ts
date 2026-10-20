import nodemailer from "nodemailer";
import { headers } from "next/headers";

// The address of the live site, used for links inside emails
export async function siteUrl(): Promise<string> {
     const raw = process.env.SITE_URL?.trim();
     const isLocal = (u: string) => /localhost|127\.0\.0\.1/.test(u);
     // On the live site a localhost address is always a mistake: use the real address
     if (
       process.env.VERCEL &&
       (!raw || isLocal(raw)) &&
       process.env.VERCEL_PROJECT_PRODUCTION_URL
     ) {
       return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
     }
     const fixed = raw;
  if (fixed) return fixed.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// paragraphs must already be safe HTML (use escapeHtml on anything typed by people)
export function emailHtml(o: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
}) {
  const paras = o.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${p}</p>`
    )
    .join("");
  const btn = o.button
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(o.button.href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">${escapeHtml(o.button.label)}</a></p>`
    : "";
  return `<div style="background:#e0e5ec;padding:24px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;   padding:28px"><p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#2563eb">KLOKIT</p><h2 style="margin:0 0 16px;font-size:20px;color:#111827">${escapeHtml(o.heading)}</h2>${paras}${btn}<p style="margin:22px 0 0;font-size:12px;color:#6b7280">   If you were not expecting this email, you can ignore it. Made by WellesTech.</p></div></div>`;
}

// Never throws: a failed email must not break the action that triggered it
export async function sendMail(o: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn("Email is not configured (SMTP_* settings are missing)");
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? user,
      to: o.to,
      subject: o.subject,
      html: o.html,
      text: o.text,
    });
    return true;
  } catch (e) {
    console.error("sendMail failed", e);
    return false;
  }
}

   // The public address of the admin site, for links in emails sent to you
   export function adminSiteUrl(): string | null {
     const raw = (process.env.ADMIN_SITE_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? "")
       .trim()
       .replace(/\/+$/, "");
     if (!raw) return null;
     if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(raw)) return null;
     return raw;
   }