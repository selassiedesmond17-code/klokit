"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/icons";
import Brand from "@/components/brand";

type OrgItem = {
  id: string;
  name: string;
  status: string;
  isOrgAdmin: boolean;
  isManager: boolean;
};

type NavData = {
  email: string | null;
  name: string | null;
  isSuperadmin: boolean;
  orgs: OrgItem[];
};

type MembershipRow = {
  role: string;
  organizations: { id: string; name: string; status: string } | null;
};

type Item = { href: string; label: string; icon: string; active: boolean };

const PRIMARY = ["Dashboard", "Departments", "Sessions", "Reports"];

function initialsOf(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (label.slice(0, 2) || "?").toUpperCase();
}

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<NavData | null>(null);
  const [stored, setStored] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [pend, setPend] = useState<{ href: string; from: string } | null>(null);
  const lastLoad = useRef(0);
  const forced = useRef<string | null>(null);

  const hidden = pathname.startsWith("/login");
  const urlOrg = pathname.match(/^\/org\/([0-9a-fA-F-]{36})/)?.[1] ?? null;

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setData(null);
      return;
    }
    const uid = session.user.id;
    const [mem, dm, pa, prof] = await Promise.all([
      supabase
        .from("memberships")
        .select("role, organizations(id, name, status)")
        .eq("user_id", uid),
      supabase
        .from("department_members")
        .select("organization_id, role")
        .eq("user_id", uid)
        .in("role", ["admin", "assistant"]),
      supabase.rpc("is_platform_admin"),
      supabase
        .from("org_profiles")
        .select("full_name")
        .eq("user_id", uid)
        .not("full_name", "is", null)
        .limit(1),
    ]);
    const managerOrgs = new Set(
      ((dm.data ?? []) as { organization_id: string }[]).map(
        (r) => r.organization_id
      )
    );
    const orgs = ((mem.data ?? []) as unknown as MembershipRow[]).flatMap(
      (m) =>
        m.organizations
          ? [
              {
                id: m.organizations.id,
                name: m.organizations.name,
                status: m.organizations.status,
                isOrgAdmin: m.role === "org_admin",
                isManager: managerOrgs.has(m.organizations.id),
              },
            ]
          : []
    );
    const name =
      ((prof.data ?? []) as { full_name: string | null }[])[0]?.full_name ??
      null;
    try {
      setStored(localStorage.getItem("currentOrg"));
    } catch {
      // storage unavailable
    }
    setData({
      email: session.user.email ?? null,
      name,
      isSuperadmin: Boolean(pa.data),
      orgs,
    });
  }, []);

  // Keep the list fresh, without asking the database on every click
  useEffect(() => {
    if (hidden) return;
    const now = Date.now();
    const unknown =
      urlOrg !== null &&
      data !== null &&
      !data.orgs.some((o) => o.id === urlOrg);
    const forceNow = unknown && forced.current !== urlOrg;
    if (!forceNow && now - lastLoad.current < 10000) return;
    if (forceNow) forced.current = urlOrg;
    lastLoad.current = now;
    void load();
  }, [pathname, hidden, urlOrg, data, load]);

  useEffect(() => {
    if (!urlOrg) return;
    try {
      localStorage.setItem("currentOrg", urlOrg);
    } catch {
      // storage unavailable
    }
  }, [urlOrg]);

  if (hidden) return null;

  const orgs = data?.orgs ?? [];
  const current =
    orgs.find((o) => o.id === urlOrg) ??
    orgs.find((o) => o.id === stored) ??
    orgs[0] ??
    null;

  const within = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const items: Item[] = [
    { href: "/", label: "Dashboard", icon: "home", active: pathname === "/" },
  ];
  if (current) {
    const base = `/org/${current.id}`;
    const manager = current.isOrgAdmin || current.isManager;
    const inSessions =
      pathname === `${base}/sessions` ||
      (pathname.startsWith(base) && pathname.includes("/sessions/"));
    if (manager) {
      items.push({
        href: base,
        label: "Departments",
        icon: "building",
        active:
          (pathname === base ||
            within(`${base}/departments`) ||
            within(`${base}/rooms`)) &&
          !inSessions,
      });
    }
    items.push({
      href: `${base}/sessions`,
      label: "Sessions",
      icon: "clock",
      active: inSessions,
    });
    items.push({
      href: `${base}/reports`,
      label: "Reports",
      icon: "chart",
      active: within(`${base}/reports`),
    });
    if (manager) {
      items.push({
        href: `${base}/reviews`,
        label: "Reviews",
        icon: "check",
        active: within(`${base}/reviews`),
      });
    }
    items.push({
      href: `${base}/profile`,
      label: "Profile",
      icon: "user",
      active: within(`${base}/profile`),
    });
    if (current.isOrgAdmin) {
      items.push({
        href: `${base}/settings`,
        label: "Settings",
        icon: "sliders",
        active: within(`${base}/settings`),
      });
    }
  }
  if (data?.isSuperadmin) {
    items.push({
      href: process.env.NEXT_PUBLIC_ADMIN_URL ?? "/",
      label: "Superadmin",
      icon: "shield",
      active: pathname.startsWith("/superadmin"),
    });
  }

  const primary = items.filter((i) => PRIMARY.includes(i.label));
  const secondary = items.filter((i) => !PRIMARY.includes(i.label));
  const email = data?.email ?? "";
  const display = data?.name ?? (email || "Signed in");
  const initials = initialsOf(data?.name ?? email);

  const pendingHref = pend && pend.from === pathname ? pend.href : null;
  const isActive = (i: Item) =>
    pendingHref ? i.href === pendingHref : i.active;

  function press(href: string) {
    return (e: React.MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      if (href === pathname) return;
      setPend({ href, from: pathname });
      window.setTimeout(
        () => setPend((p) => (p && p.href === href ? null : p)),
        8000
      );
    };
  }

  function switchOrg(id: string) {
    try {
      localStorage.setItem("currentOrg", id);
    } catch {
      // storage unavailable
    }
    const m = pathname.match(/^\/org\/[^/]+\/(sessions|reports|settings|reviews|profile)$/);
    window.dispatchEvent(new Event("app-navigate"));
    router.push(m ? `/org/${id}/${m[1]}` : `/org/${id}`);
    setSheet(false);
  }

  const renderItem = (i: Item) => {
    const loading = pendingHref === i.href;
    return (
      <Link
        key={i.href}
        href={i.href}
        className={`nav-item${loading ? " is-pending" : ""}`}
        aria-current={isActive(i) ? "page" : undefined}
        onClick={press(i.href)}
      >
        <Icon name={i.icon} size={20} />
        <span>{i.label}</span>
        {loading && <span className="spinner nav-item-spinner" aria-hidden="true" />}
      </Link>
    );
  };

  const renderTab = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      className="nav-tab"
      aria-current={isActive(i) ? "page" : undefined}
      onClick={press(i.href)}
    >
      <Icon name={i.icon} size={22} />
      <span>{i.label}</span>
    </Link>
  );

  const account = (
    <div className="nav-account neu-inset">   
      <span className="nav-email font-semibold" title={email}>
        {display}
      </span>
    </div>
  );

  const orgSwitch =
    orgs.length > 1 ? (
      <label className="block">
        <span className="sr-only">Organization</span>
        <select
          className="neu-input"
          value={current?.id ?? ""}
          onChange={(e) => switchOrg(e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    ) : current ? (
      <div className="nav-org">
        <Icon name="building" size={18} />
        <span className="min-w-0 break-words">{current.name}</span>
      </div>
    ) : null;

  return (
    <nav className="app-nav" aria-label="Main navigation">
      {/* ---------- Laptop and desktop: left sidebar ---------- */}
      <div className="nav-desktop">
        <Brand />
        {account}
        {orgSwitch}
        <div className="nav-list">
          {data === null ? (
            <>
              <div className="skeleton h-11 w-full" />
              <div className="skeleton h-11 w-full" />
              <div className="skeleton h-11 w-full" />
            </>
          ) : (
            items.map(renderItem)
          )}
        </div>
        <div className="nav-spacer" />
        <form action="/auth/signout" method="post">
          <button className="nav-item">
            <Icon name="logout" size={20} />
            <span>Sign out</span>
          </button>
        </form>
      </div>

      {/* ---------- Phone: bottom bar ---------- */}
      <div className="nav-mobile">
        {primary.map(renderTab)}
        <button
          type="button"
          className="nav-tab"
          aria-expanded={sheet}
          aria-haspopup="dialog"
          onClick={() => setSheet((s) => !s)}
        >
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </div>

      {sheet && (
        <>
          <div
            className="nav-sheet-backdrop"
            onClick={() => setSheet(false)}
            aria-hidden="true"
          />
          <div
            className="nav-sheet neu-card"
            role="dialog"
            aria-label="More options"
            onClick={(e) => {
              if ((e.target as Element).closest("a")) setSheet(false);
            }}
          >
            {account}
            {orgSwitch}
            {secondary.map(renderItem)}
            <form action="/auth/signout" method="post">
              <button className="nav-item">
                <Icon name="logout" size={20} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </>
      )}
    </nav>
  );
}