import { FIELD_KEYS, resolveConfig, type FieldKey } from "@/lib/org-types";
import { DATE_RE, UUID_RE } from "@/lib/report-filters";

export const REPORT_STATUSES = [
  "recorded",
  "corrected",
  "pending_review",
  "rejected",
  "voided",
  "absent",
];

export const STATUS_LABELS: Record<string, string> = {
  recorded: "Recorded",
  corrected: "Corrected",
  pending_review: "Pending review",
  rejected: "Rejected",
  voided: "Voided",
  absent: "Absent (no clocking)",
};

export type MatrixRow = {
  session_id: string;
  session_title: string;
  session_date: string;
  room_name: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  id_number: string | null;
  department: string | null;
  class_name: string | null;
  group_name: string | null;
  level: string | null;
  job_title: string | null;
  in_time: string | null;
  in_status: string | null;
  in_note: string | null;
  in_approved: boolean;
  out_time: string | null;
  out_status: string | null;
  out_note: string | null;
  out_approved: boolean;
};

// Which filter box belongs to which profile detail
export const FIELD_FILTER_PARAM: Partial<Record<FieldKey, string>> = {
  phone: "phone",
  id_number: "id",
  department: "department",
  class_name: "class",
  group_name: "group",
  level: "level",
};

export const FILTER_KEYS = [
  "from",
  "to",
  "room",
  "dept",
  "status",
  "name",
  "email",
  "phone",
  "id",
  "class",
  "group",
  "level",
  "department",
];

// Turns the filter boxes into safe values for the database function
export function parseMatrixFilters(get: (key: string) => string | null) {
  const clean = (k: string) => {
    const v = get(k)?.trim();
    return v ? v.slice(0, 100) : null;
  };
  const from = get("from");
  const to = get("to");
  const room = get("room");
  const dept = get("dept");
  const status = get("status");
  return {
    p_from: from && DATE_RE.test(from) ? from : null,
    p_to: to && DATE_RE.test(to) ? to : null,
    p_room: room && UUID_RE.test(room) ? room : null,
    p_dept: dept && UUID_RE.test(dept) ? dept : null,
    p_name: clean("name"),
    p_email: clean("email"),
    p_phone: clean("phone"),
    p_id: clean("id"),
    p_class: clean("class"),
    p_group: clean("group"),
    p_level: clean("level"),
    p_department: clean("department"),
    p_status: status && REPORT_STATUSES.includes(status) ? status : null,
  };
}

// The profile details this organization actually uses (hidden ones are left out)
export function shownFields(profileFields: unknown, type: string): FieldKey[] {
  const c = resolveConfig(profileFields, type);
  return FIELD_KEYS.filter(
    (k) => c.admin[k] !== "hidden" || c.user[k] !== "hidden"
  );
}