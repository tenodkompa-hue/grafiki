export type OcrLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type ShiftRow = {
  id: string;
  name: string;
  description: string;
  start: string | null;
  end: string | null;
  excluded: boolean;
  status: "green" | "orange" | "red";
  issue: string;
  sourceLines: string[];
};

export type HourResult = {
  hour: number;
  count: number;
  uncertain: number;
  employees: string[];
};

const EXCLUDED_CODES = /\b(kons|kz1|kz2|kz3|pwsp|pw)\b/i;
const TIME_RE = /(?<!\d)([01]?\d|2[0-3])[:. ]([0-5]\d)(?!\d)/g;

function minutes(value: string): number | null {
  const match = value.match(/(\d{1,2})[:. ](\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function normalizeTime(value: string): string | null {
  const total = minutes(value);
  if (total === null) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function centerY(line: OcrLine) {
  return (line.bbox.y0 + line.bbox.y1) / 2;
}

export function parseScheduleLines(lines: OcrLine[]): ShiftRow[] {
  const usable = lines
    .filter((line) => line.text.trim() && line.bbox.y1 > line.bbox.y0)
    .sort((a, b) => centerY(a) - centerY(b));

  const heights = usable.map((line) => Math.max(1, line.bbox.y1 - line.bbox.y0));
  const tolerance = Math.max(9, (heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 12) * 0.9);
  const bands: OcrLine[][] = [];

  for (const line of usable) {
    const band = bands.find((items) =>
      Math.abs(centerY(items[0]) - centerY(line)) <= tolerance
    );
    if (band) band.push(line);
    else bands.push([line]);
  }

  const rows: ShiftRow[] = [];
  for (const band of bands) {
    const ordered = [...band].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const combined = ordered.map((line) => line.text.trim()).join(" | ");
    const matches = [...combined.matchAll(TIME_RE)].map((match) => match[0]);
    if (matches.length === 0) continue;

    const times = matches.map(normalizeTime).filter((value): value is string => Boolean(value));
    const description = ordered
      .filter((line) => EXCLUDED_CODES.test(line.text))
      .map((line) => line.text.trim())
      .join(" ");
    const excluded = EXCLUDED_CODES.test(combined);

    const nameCandidate = ordered.find((line) => {
      const text = line.text.trim();
      return !TIME_RE.test(text) && !EXCLUDED_CODES.test(text) && /[A-Za-zÀ-ž]{2,}/.test(text);
    });
    TIME_RE.lastIndex = 0;
    const name = nameCandidate?.text.trim() || "Nie rozpoznano nazwiska";
    const confidence = Math.min(...ordered.map((line) => line.confidence ?? 0));
    let status: ShiftRow["status"] = "green";
    let issue = "";

    if (times.length < 2) {
      status = "red";
      issue = "Nie udało się odczytać początku i końca zmiany";
    } else if (times.length > 2) {
      status = "orange";
      issue = "Wykryto więcej niż dwie godziny — możliwa korekta lub dodatkowy odcinek";
    } else if (confidence < 75 || !nameCandidate) {
      status = "orange";
      issue = !nameCandidate ? "Niepewne nazwisko pracownika" : "Niska pewność odczytu OCR";
    }

    rows.push({
      id: `row-${rows.length}-${Math.round(centerY(ordered[0]))}`,
      name,
      description,
      start: times[0] ?? null,
      end: times[1] ?? null,
      excluded,
      status,
      issue,
      sourceLines: ordered.map((line) => line.text.trim()),
    });
  }
  return rows;
}

export function calculateHourlyStaff(rows: ShiftRow[]): HourResult[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const employees: string[] = [];
    let uncertain = 0;
    for (const row of rows) {
      if (row.excluded || !row.start || !row.end || row.status === "red") continue;
      const start = minutes(row.start);
      const end = minutes(row.end);
      if (start === null || end === null) continue;
      const startHour = Math.floor(start / 60);
      const endHour = Math.floor(end / 60);
      const overnight = end < start;
      const isIncluded = overnight
        ? hour >= startHour || hour < endHour
        : hour >= startHour && hour < endHour;
      if (isIncluded) {
        employees.push(row.name);
        if (row.status === "orange") uncertain += 1;
      }
    }
    return { hour, count: employees.length, uncertain, employees };
  });
}
