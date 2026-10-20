   import { sendMail, emailHtml, escapeHtml, adminSiteUrl } from "@/lib/mail";

const MAX_RECIPIENTS = 50;

function superadmins() {
  return (process.env.PLATFORM_ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// Someone was added to a room
export async function notifyAdded(p: {
  site: string;
  orgName: string;
  roomName: string;
  by?: string | null;
  emails: string[];
  role?: "room_admin" | "assistant" | "user";
  roleText?: string;
}) {
  const label =
    p.roleText ?? (p.role === "room_admin" ? "a room admin" : "a user");
  await Promise.all(
    p.emails.slice(0, MAX_RECIPIENTS).map((to) =>
      sendMail({
        to,
        subject: `You have been added to ${p.orgName} on KlokIt`,
        html: emailHtml({
          heading: `You have been added to ${p.orgName}`,
          paragraphs: [
            `${p.by ? escapeHtml(p.by) : "An administrator"} added you as <strong>${escapeHtml(label)}</strong> in <strong>${escapeHtml(p.roomName)}</strong> at <strong>${escapeHtml(p.orgName)}</strong>.`,
            `Please sign in with this email address (<strong>${escapeHtml(to)}</strong>) to verify it and get started. We will email you a one-time code, and you may be asked to complete your profile.`,
          ],
          button: { label: "Sign in", href: `${p.site}/login` },
        }),
        text: `${p.by ?? "An administrator"} added you as ${label} in ${p.roomName} at ${p.orgName}. Sign in with ${to} to verify and get started: ${p.site}/login`,
      })
    )
  );
}

// To the person who registered: we got it
export async function notifyRegistrationReceived(p: {
  to: string;
  name: string;
  orgName: string;
}) {
  await sendMail({
    to: p.to,
    subject: "We received your KlokIt registration",
    html: emailHtml({
      heading: "Registration received",
      paragraphs: [
        `Hello ${escapeHtml(p.name)}, thank you for registering <strong>${escapeHtml(p.orgName)}</strong> on KlokIt.`,
        "Your registration is waiting for approval. You cannot sign in until it is approved, and we will email you as soon as it is.",
      ],
    }),
    text: `Hello ${p.name}, we received the registration for ${p.orgName}. You cannot sign in until it is approved. We will email you.`,
  });
}

// To you, the superadmin: something is waiting
export async function notifyNewRegistration(p: {
  site: string;
  orgName: string;
  typeLabel: string;
  by: string;
  byEmail: string;
}) {
  await Promise.all(
    superadmins().map((to) =>
      sendMail({
        to,
        subject: `Waiting for approval: ${p.orgName}`,
        html: emailHtml({
          heading: "An organization is waiting for approval",
          paragraphs: [
            `<strong>${escapeHtml(p.orgName)}</strong> (${escapeHtml(p.typeLabel)}) was registered by ${escapeHtml(p.by)} (${escapeHtml(p.byEmail)}).`,
            "Review it, choose which details people must fill in, and approve or reject it.",
          ],
          button: { label: "Review now", href: adminSiteUrl() ?? p.site },
        }),
        text: `${p.orgName} (${p.typeLabel}) is waiting for approval: ${adminSiteUrl() ?? p.site}`,
      })
    )
  );
}

// Approved: they can now sign in
export async function notifyRegistrationApproved(p: {
  site: string;
  to: string;
  name: string;
  orgName: string;
}) {
  await sendMail({
    to: p.to,
    subject: `${p.orgName} is approved on KlokIt`,
    html: emailHtml({
      heading: `${p.orgName} is approved`,
      paragraphs: [
        `Good news, ${escapeHtml(p.name)}: <strong>${escapeHtml(p.orgName)}</strong> has been approved.`,
        `Sign in with this email address (<strong>${escapeHtml(p.to)}</strong>). We will email you a one-time code. Then you can create departments and rooms and add your people.`,
      ],
      button: { label: "Sign in", href: `${p.site}/login` },
    }),
    text: `${p.orgName} has been approved. Sign in with ${p.to}: ${p.site}/login`,
  });
}

export async function notifyRegistrationRejected(p: {
  to: string;
  name: string;
  orgName: string;
  reason: string;
}) {
  await sendMail({
    to: p.to,
    subject: `Your KlokIt registration for ${p.orgName}`,
    html: emailHtml({
      heading: "Your registration was not approved",
      paragraphs: [
        `Hello ${escapeHtml(p.name)}, we could not approve the registration for <strong>${escapeHtml(p.orgName)}</strong>.`,
        `Reason: ${escapeHtml(p.reason)}`,
      ],
    }),
    text: `We could not approve the registration for ${p.orgName}. Reason: ${p.reason}`,
  });
}

// An existing organization was switched back on
export async function notifyActivated(p: {
  site: string;
  orgName: string;
  emails: string[];
}) {
  await Promise.all(
    p.emails.slice(0, MAX_RECIPIENTS).map((to) =>
      sendMail({
        to,
        subject: `${p.orgName} is now active`,
        html: emailHtml({
          heading: `${p.orgName} is now active`,
          paragraphs: [
            `<strong>${escapeHtml(p.orgName)}</strong> is active on KlokIt.`,
            "Sign in to manage your rooms and people.",
          ],
          button: { label: "Sign in", href: `${p.site}/login` },
        }),
        text: `${p.orgName} is active. Sign in: ${p.site}/login`,
      })
    )
  );
}