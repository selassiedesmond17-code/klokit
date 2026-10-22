export type Level = "hidden" | "optional" | "required";

export const FIELD_KEYS = [
  "phone",
  "id_number",
  "department",
  "class_name",
  "group_name",
  "level",
  "job_title",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldConfig = Record<FieldKey, Level>;
export type ProfileConfig = { admin: FieldConfig; user: FieldConfig };

export const ORG_TYPES = [
  { value: "retail_hospitality", label: "Retail and Hospitality" },
  { value: "healthcare", label: "Healthcare" },
  { value: "manufacturing_construction", label: "Manufacturing and Construction" },
  { value: "small_business", label: "Small Business" },
  { value: "school", label: "School" },
  { value: "university", label: "University" },
] as const;

export function typeLabel(type: string) {
  return ORG_TYPES.find((t) => t.value === type)?.label ?? "Small Businesses";
}

export function isEducation(type: string) {
  return type === "school" || type === "university";
}

// What the lead of a room is called
export function adminLabel(type: string) {
  return type === "school" ? "Facilitator" : type === "university" ? "Lecturer" : "Admin";
}

// What the people who clock in are called
export function userLabel(type: string) {
  return isEducation(type) ? "Student" : "Staff";
}

// Helpers a lead can create (used in the next part)
export function assistantTitles(type: string): string[] {
  return type === "school" ? ["Class Rep"] : type === "university" ? ["TA", "Class Rep"] : [];
}

export function roleText(role: string, type: string, title?: string | null) {
  if (role === "room_admin") return adminLabel(type);
  if (role === "assistant") return title ?? "Assistant";
  return userLabel(type);
}

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Column headings for the settings table
export function groupLabels(type: string) {
  const user = isEducation(type)
    ? joinList([
        `${userLabel(type)}s`,
        ...assistantTitles(type).map((t) => `${t}s`),
      ])
    : "Staff";
  return { admin: `${adminLabel(type)}s and platform admins`, user };
}

const DEFAULT_LABELS: Record<FieldKey, string> = {
  phone: "Phone number",
  id_number: "ID number",
  department: "Department",
  class_name: "Class",
  group_name: "Group",
  level: "Level",
  job_title: "Position",
};

const LABELS: Record<string, Partial<Record<FieldKey, string>>> = {
  retail_hospitality: {
    id_number: "Employee ID",
    department: "Outlet / Department",
    group_name: "Shift team",
    job_title: "Position",
  },
  healthcare: {
    id_number: "Staff ID",
    department: "Department / Ward",
    group_name: "Unit",
    job_title: "Role",
  },
  manufacturing_construction: {
    id_number: "Employee ID",
    department: "Department / Site",
    group_name: "Crew",
    job_title: "Trade / Role",
  },
  small_business: {
    id_number: "Staff ID",
    department: "Department",
    group_name: "Team",
    job_title: "Position",
  },
  school: {
    id_number: "Student ID",
    department: "Department",
    class_name: "Class",
    group_name: "House / Group",
    level: "Level / Form",
    job_title: "Role",
  },
  university: {
    id_number: "Student ID",
    department: "Department / Programme",
    class_name: "Class",
    group_name: "Group",
    level: "Level",
    job_title: "Role",
  },
};

// Schools and universities: students have a Student ID, their lecturers a Staff ID
export function fieldLabel(
  type: string,
  key: FieldKey,
  who: "admin" | "user" = "user"
) {
  if (key === "id_number" && isEducation(type)) {
    return who === "admin" ? "Staff ID" : "Student ID";
  }
  return LABELS[type]?.[key] ?? DEFAULT_LABELS[key];
}

const H: Level = "hidden";
const O: Level = "optional";
const R: Level = "required";

// phone, id_number, department, class_name, group_name, level, job_title
function cfg(
  phone: Level,
  id: Level,
  dept: Level,
  cls: Level,
  grp: Level,
  lvl: Level,
  job: Level
): FieldConfig {
  return {
    phone,
    id_number: id,
    department: dept,
    class_name: cls,
    group_name: grp,
    level: lvl,
    job_title: job,
  };
}

const PRESETS: Record<string, ProfileConfig> = {
  retail_hospitality: { user: cfg(O, O, O, H, O, H, O), admin: cfg(R, O, O, H, H, H, O) },
  healthcare: { user: cfg(O, R, R, H, O, H, O), admin: cfg(R, R, R, H, H, H, R) },
  manufacturing_construction: { user: cfg(O, R, O, H, O, H, O), admin: cfg(R, R, O, H, H, H, O) },
  small_business: { user: cfg(O, H, H, H, H, H, H), admin: cfg(R, H, H, H, H, H, H) },
  school: { user: cfg(O, R, H, R, O, O, H), admin: cfg(R, O, O, H, H, H, O) },
  university: { user: cfg(O, R, R, O, O, R, H), admin: cfg(R, O, R, H, H, H, O) },
};

export function presetFor(type: string): ProfileConfig {
  const p = PRESETS[type] ?? PRESETS.small_business;
  return { admin: { ...p.admin }, user: { ...p.user } };
}

function asLevel(v: unknown): Level {
  return v === "hidden" || v === "optional" || v === "required" ? v : "optional";
}

// Stored settings win. Anything missing counts as optional, as in the database.
export function resolveConfig(raw: unknown, type: string): ProfileConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const out = presetFor(type);
  for (const who of ["admin", "user"] as const) {
    for (const k of FIELD_KEYS) out[who][k] = asLevel(obj[who]?.[k]);
  }
  return out;
}

// Reads the settings table from a submitted form
export function parseConfigForm(formData: FormData, type: string): ProfileConfig {
  if (formData.get("reset_defaults") === "on") return presetFor(type);
  const lv = (v: FormDataEntryValue | null): Level =>
    v === "required" || v === "optional" ? v : "hidden";
  const built = presetFor(type);
  for (const who of ["admin", "user"] as const) {
    for (const k of FIELD_KEYS) built[who][k] = lv(formData.get(`${who}_${k}`));
  }
  return built;
}