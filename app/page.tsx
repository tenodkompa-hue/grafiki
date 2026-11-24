"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { calculateHourlyStaff, type ShiftRow } from "../lib/schedule";

type SelectedImage = {
  id: string;
  file: File;
  preview: string;
  text?: string;
  progress: number;
  status: "ready" | "processing" | "done" | "error";
};

const MAX_IMAGES = 5;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    setImages((current) => {
      const accepted = incoming.slice(0, Math.max(0, MAX_IMAGES - current.length));
      return [...current, ...accepted.map((file) => ({
        id: crypto.randomUUID(), file, preview: URL.createObjectURL(file),
        progress: 0, status: "ready" as const,
      }))];
    });
    setRows([]);
    setHasRun(false);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
    setRows([]);
    setHasRun(false);
  }

  async function runOcr() {
    if (!images.length || isProcessing) return;
    setIsProcessing(true);
    setRows([]);
    setHasRun(false);
    const parsedRows: ShiftRow[] = [];

    try {
      for (const image of images) {
        setImages((current) => current.map((item) =>
          item.id === image.id ? { ...item, status: "processing", progress: 0, text: undefined } : item
        ));
        try {
          const form = new FormData();
          form.append("image", image.file);
          const response = await fetch("/api/analyze", { method: "POST", body: form });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Nie udało się przeanalizować zdjęcia.");

          const employees = Array.isArray(payload.employees) ? payload.employees : [];
          parsedRows.push(...employees.map((employee: {
            name?: string; description?: string; start?: string | null; end?: string | null;
            excluded?: boolean; confidence?: number; issue?: string;
          }, index: number): ShiftRow => {
            const confidence = Number(employee.confidence ?? 0);
            const validTimes = Boolean(employee.start && employee.end);
            const status: ShiftRow["status"] = !validTimes ? "red" : confidence >= 85 && !employee.issue ? "green" : "orange";
            return {
              id: `${image.id}-ai-${index}`,
              name: employee.name || "Nie rozpoznano nazwiska",
              description: employee.description || "",
              start: employee.start || null,
              end: employee.end || null,
              excluded: Boolean(employee.excluded),
              status,
              issue: employee.issue || (!validTimes ? "Brak pewnego początku lub końca zmiany" : confidence < 85 ? "Sprawdź odczyt AI" : ""),
              sourceLines: [],
            };
          }));
          setImages((current) => current.map((item) =>
            item.id === image.id ? { ...item, status: "done", progress: 100, text: `Rozpoznano ${employees.length} wierszy pracowników.` } : item
          ));
        } catch (error) {
          setImages((current) => current.map((item) =>
            item.id === image.id ? { ...item, status: "error", text: error instanceof Error ? error.message : "Błąd analizy" } : item
          ));
        }
      }
      setRows(parsedRows);
      setHasRun(true);
    } finally {
      setIsProcessing(false);
    }
  }

  function updateRow(id: string, patch: Partial<ShiftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  const hours = calculateHourlyStaff(rows);
  const completedCount = images.filter((image) => image.status === "done").length;
  const activeRows = rows.filter((row) => !row.excluded && row.status !== "red");
  const reviewCount = rows.filter((row) => row.status !== "green" && !row.excluded).length;

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Chatelier Solutions">
          <span className="brand-mark">CS</span><span>CHATELIER <b>SOLUTIONS</b></span>
        </a>
        <span className="topbar-note">NARZĘDZIE DO ANALIZY GRAFIKÓW</span>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> WORKFORCE ANALYTICS</div>
        <h1>Grafik pod kontrolą.<br /><span>Godzina po godzinie.</span></h1>
        <p className="hero-copy">Dodaj zdjęcia grafiku, aby odczytać zmiany i policzyć obsadę pracowników w każdej godzinie.</p>

        <div className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={onInputChange} hidden />
          <div className="upload-icon">↑</div>
          <h2>Dodaj zdjęcia grafiku</h2>
          <p>Przeciągnij pliki tutaj lub wybierz je z urządzenia</p>
          <button className="button button-light" onClick={() => inputRef.current?.click()}>Wybierz zdjęcia</button>
          <span className="upload-hint">JPG, PNG lub WEBP · maksymalnie 5 zdjęć</span>
        </div>

        {images.length > 0 && <section className="files-section">
          <div className="section-heading"><div><span className="mini-label">MATERIAŁ ŹRÓDŁOWY</span>
            <h2>Wybrane zdjęcia <span className="count">{images.length}/{MAX_IMAGES}</span></h2></div>
            <button className="text-button" onClick={() => {
              images.forEach((image) => URL.revokeObjectURL(image.preview));
              setImages([]); setRows([]); setHasRun(false);
            }} disabled={isProcessing}>Usuń wszystkie</button>
          </div>
          <div className="image-grid">{images.map((image, index) => <article className="image-card" key={image.id}>
            <div className="preview-wrap"><img src={image.preview} alt={`Zdjęcie grafiku ${index + 1}`} />
              <button className="remove-button" onClick={() => removeImage(image.id)} disabled={isProcessing} aria-label="Usuń zdjęcie">×</button>
            </div>
            <div className="image-meta"><span>ARKUSZ {String(index + 1).padStart(2, "0")}</span>
              <span className={`status status-${image.status}`}>{image.status === "ready" ? "Gotowe" : image.status === "processing" ? "Odczytuję…" : image.status === "done" ? "Odczyt zakończony" : "Błąd odczytu"}</span>
            </div>
          </article>)}</div>
          <button className="button button-primary analyze-button" onClick={runOcr} disabled={isProcessing || !images.length}>
            {isProcessing ? "Odczytuję i analizuję grafik…" : "Odczytaj i policz obsadę"} <span>↗</span>
          </button>
          {completedCount > 0 && <p className="privacy-note">Odczytano {completedCount} z {images.length} zdjęć. Przetwarzanie odbywa się w przeglądarce.</p>}
        </section>}

        {hasRun && <section className="results-section">
          <div className="section-heading"><div><span className="mini-label">WYNIK ANALIZY</span><h2>Obsada godzinowa</h2></div>
            <span className="review-label">{reviewCount ? `${reviewCount} DO WERYFIKACJI` : "ODCZYT ZAKOŃCZONY"}</span>
          </div>
          <p className="ocr-intro">Zasada liczenia: zaokrąglamy początek zmiany w dół do pełnej godziny, a godzinę końca traktujemy jako wyłączną. Zmiana 10:15–18:15 jest liczona od 10:00 do 17:00. Wiersze niepewne wymagają sprawdzenia.</p>
          <div className="hour-grid">{hours.map((item) => <details className={`hour-card ${item.uncertain ? "hour-review" : ""}`} key={item.hour}>
            <summary><span>{String(item.hour).padStart(2, "0")}:00</span><strong>{item.count}</strong>
              <small>{item.uncertain ? `sprawdź ${item.uncertain}` : "osób"}</small></summary>
            <div className="hour-people">{item.employees.length ? item.employees.map((name, index) => <div key={index}>{name}</div>) : <span>Brak pracowników</span>}</div>
          </details>)}</div>
          <div className="section-heading employee-heading"><div><span className="mini-label">DANE ODCZYTANE Z TABELI</span><h2>Weryfikacja zmian <span className="count">{rows.length} wierszy</span></h2></div></div>
          <p className="ocr-intro">Możesz poprawić nazwisko i godziny. Wiersze z niepewnym odczytem są oznaczone na pomarańczowo lub czerwono. Wykluczone kody w opisie: kons, kz1, kz2, kz3, Pw, pwsp.</p>
          <div className="table-wrap"><table className="staff-table"><thead><tr><th>Pracownik</th><th>Od</th><th>Do</th><th>Opis / status</th><th>Wyklucz</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className={`row-${row.status}`}>
              <td><input aria-label="Nazwisko pracownika" value={row.name} onChange={(e) => updateRow(row.id, { name: e.target.value })} /></td>
              <td><input aria-label="Początek zmiany" placeholder="--:--" value={row.start ?? ""} onChange={(e) => updateRow(row.id, { start: e.target.value || null, status: "orange", issue: "Godzina zmieniona ręcznie — sprawdź" })} /></td>
              <td><input aria-label="Koniec zmiany" placeholder="--:--" value={row.end ?? ""} onChange={(e) => updateRow(row.id, { end: e.target.value || null, status: "orange", issue: "Godzina zmieniona ręcznie — sprawdź" })} /></td>
              <td><span className="row-issue">{row.excluded ? "Wykluczony kodem" : row.issue || row.description || "Odczyt pewny"}</span></td>
              <td><input type="checkbox" checked={row.excluded} onChange={(e) => updateRow(row.id, { excluded: e.target.checked })} aria-label="Wyklucz pracownika" /></td>
            </tr>)}</tbody></table></div>
          <div className="legend"><span className="legend-green">● Pewny odczyt</span><span className="legend-orange">● Sprawdź</span><span className="legend-red">● Nie udało się odczytać</span></div>
          <p className="privacy-note">Wynik jest wstępną analizą OCR. Skreślenia, odręczne dopiski i dodatkowe segmenty zmian mogą wymagać ręcznej korekty. Nie traktuj automatycznego odczytu jako zatwierdzonego grafiku.</p>
        </section>}
      </section>
      <footer className="footer"><span>CHATELIER SOLUTIONS</span><span>Prościej analizować. Lepiej planować.</span></footer>
    </main>
  );
}
