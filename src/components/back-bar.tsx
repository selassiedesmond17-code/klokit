"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ID = "[0-9a-fA-F-]{36}";

// Most specific pages first
const RULES: [RegExp, (m: RegExpMatchArray) => { href: string; label: string }][] = [
  [
    new RegExp(`^/org/(${ID})/departments/(${ID})/edit$`),
    (m) => ({ href: `/org/${m[1]}/departments/${m[2]}`, label: "Department" }),
  ],
  [
    new RegExp(`^/org/(${ID})/departments/(${ID})$`),
    (m) => ({ href: `/org/${m[1]}`, label: "Departments" }),
  ],
  [
    new RegExp(`^/org/(${ID})/people/(${ID})$`),
    (m) => ({ href: `/org/${m[1]}`, label: "Departments" }),
  ],
  [
    new RegExp(`^/org/(${ID})/rooms/(${ID})/sessions/(${ID})$`),
    (m) => ({ href: `/org/${m[1]}/rooms/${m[2]}/sessions`, label: "Sessions" }),
  ],
  [
    new RegExp(`^/org/(${ID})/rooms/(${ID})/(edit|location|sessions)$`),
    (m) => ({ href: `/org/${m[1]}/rooms/${m[2]}`, label: "Room" }),
  ],
  [
    new RegExp(`^/org/(${ID})/rooms/(${ID})$`),
    (m) => ({ href: `/org/${m[1]}`, label: "Departments" }),
  ],
  [/^\/s\/[^/]+$/, () => ({ href: "/", label: "Dashboard" })],
];

export default function BackBar() {
  const pathname = usePathname();
  for (const [re, make] of RULES) {
    const m = pathname.match(re);
    if (m) {
      const { href, label } = make(m);
      return (
        <div className="back-bar">
          <Link href={href} className="neu-back">
            ← {label}
          </Link>
        </div>
      );
    }
  }
  return null;
}