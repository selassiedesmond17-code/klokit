"use client";

import { useState } from "react";

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

export default function RepeatFields() {
  const [unit, setUnit] = useState("none");
  const [count, setCount] = useState("1");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  const toggle = (n: number) =>
    setDays((d) =>
      d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)
    );
  const noun = unit === "weeks" ? "weeks" : unit === "months" ? "months" : "days";
  const chosen = DAYS.filter((d) => days.includes(d.n)).map((d) => d.label);

  return (
    <fieldset className="neu-inset flex flex-col gap-3">
      <legend className="field px-1">Repeat</legend>

      <select
        name="repeat_unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label="Repeat"
        className="neu-input"
      >
        <option value="none">Does not repeat</option>
        <option value="days">Repeat for a number of days</option>
        <option value="weeks">Repeat for a number of weeks</option>
        <option value="months">Repeat for a number of months</option>
      </select>

      {unit !== "none" && (
        <>
          <label className="field">
            For how many {noun}
            <input
              type="number"
              name="repeat_count"
              min={1}
              max={366}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="neu-input mt-1"
            />
          </label>

          <div>
            <span className="field">On these days of the week</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.n} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="weekday"
                    value={d.n}
                    checked={days.includes(d.n)}
                    onChange={() => toggle(d.n)}
                    className="peer sr-only"
                  />
                  <span className="neu-btn neu-btn-sm peer-checked:bg-[var(--btn-primary)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                    {d.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="neu-btn neu-btn-sm"
                onClick={() => setDays([1, 2, 3, 4, 5])}
              >
                Mon to Fri
              </button>
              <button
                type="button"
                className="neu-btn neu-btn-sm"
                onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}
              >
                Every day
              </button>
              <button
                type="button"
                className="neu-btn neu-btn-sm"
                onClick={() => setDays([])}
              >
                Clear
              </button>
            </div>
          </div>

          <p className="muted text-xs">
            {chosen.length === 0
              ? "Tick at least one day."
              : `A session on ${chosen.join(", ")}, for ${count || 1} ${noun}.`}{" "}
            The range starts on the date you choose above. Each day is its own
            session (people clock in and out once per day), and they all share
            one QR code. Each session must be shorter than 24 hours.
          </p>
        </>
      )}
    </fieldset>
  );
}