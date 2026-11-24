import { dublinDay } from "./format";

// A CSV file from rows, as spreadsheets read it: commas, quotes and line breaks quoted, and a cell that starts like a formula (= + - @, a tab
// or a return) prefixed with ' so a spreadsheet never runs it. Customer text (a name, a message) ends up in these files. Pure, so tested.
export type CsvColumn<T> = [header: string, value: (row: T) => string | number | boolean | null | undefined];

const cell = (v: string | number | boolean | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return [columns.map(([h]) => cell(h)), ...rows.map((r) => columns.map(([, f]) => cell(f(r))))].map((line) => line.join(",")).join("\r\n") + "\r\n";
}

// The response for a CSV download: a file name dated today unless the name has its own period, never cached, never indexed.
export function csvResponse(name: string, csv: string, dated = true): Response {
  const file = dated ? `${name}-${dublinDay()}` : name;
  return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
