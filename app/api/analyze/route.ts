import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    employees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          start: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
          excluded: { type: "boolean" },
          confidence: { type: "number" },
          issue: { type: "string" }
        },
        required: ["name", "description", "start", "end", "excluded", "confidence", "issue"]
      }
    }
  },
  required: ["employees"]
};

export async function POST(request: NextRequest) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "Brak OPENAI_API_KEY w ustawieniach Vercel." }, { status: 500 });

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nie otrzymano zdjęcia." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Plik nie jest obrazem." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Zdjęcie przekracza limit 15 MB." }, { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "schedule_reading", strict: true, schema }
        },
        messages: [
          {
            role: "system",
            content: "Jesteś precyzyjnym czytnikiem papierowych grafików pracowniczych. Odczytuj wyłącznie dane widoczne na zdjęciu. Każdy pracownik to osobny wiersz tabeli. Powiąż nazwisko, opis oraz godziny według kolumn, nie według kolejności tekstu. Godziny zwracaj jako HH:MM. Jeśli wartość jest nieczytelna, skreślona bez jednoznacznej poprawki lub niepewna, zwróć null i opisz problem w issue. Jeśli widzisz poprawioną godzinę odręcznie, użyj jej tylko gdy jest jednoznaczna; w przeciwnym razie null. Dodatkowe segmenty godzin wpisz w issue i nie zgaduj. Wykluczaj osoby, których opis zawiera kons, kz1, kz2, kz3, Pw lub pwsp. confidence to ocena 0-100. Nie twórz wierszy z nagłówków ani sum."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Odczytaj wszystkie wiersze pracowników z tego grafiku. Nie pomijaj wierszy, jeśli nazwisko lub godziny są częściowo nieczytelne; oznacz wtedy problem." },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
            ]
          }
        ]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || "Błąd usługi OpenAI.";
      return NextResponse.json({ error: message }, { status: response.status });
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Model nie zwrócił danych." }, { status: 502 });
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nieoczekiwany błąd analizy." }, { status: 500 });
  }
}
