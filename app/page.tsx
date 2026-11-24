"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { createWorker } from "tesseract.js";

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
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    );

    setImages((current) => {
      const room = MAX_IMAGES - current.length;
      const accepted = incoming.slice(0, Math.max(0, room));
      const next = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: "ready" as const,
      }));
      return [...current, ...next];
    });
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
  }

  async function runOcr() {
    if (!images.length || isProcessing) return;
    setIsProcessing(true);

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      worker = await createWorker("pol+eng");

      for (const image of images) {
        setImages((current) =>
          current.map((item) =>
            item.id === image.id
              ? { ...item, status: "processing", progress: 0, text: undefined }
              : item
          )
        );

        try {
          const result = await worker.recognize(image.file, {}, {
            blocks: true,
          });
          setImages((current) =>
            current.map((item) =>
              item.id === image.id
                ? {
                    ...item,
                    status: "done",
                    progress: 100,
                    text: result.data.text,
                  }
                : item
            )
          );
        } catch {
          setImages((current) =>
            current.map((item) =>
              item.id === image.id ? { ...item, status: "error" } : item
            )
          );
        }
      }
    } catch {
      setImages((current) =>
        current.map((item) =>
          item.status === "processing" ? { ...item, status: "error" } : item
        )
      );
    } finally {
      if (worker) await worker.terminate();
      setIsProcessing(false);
    }
  }

  const completedCount = images.filter((image) => image.status === "done").length;

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Chatelier Solutions">
          <span className="brand-mark">CS</span>
          <span>CHATELIER <b>SOLUTIONS</b></span>
        </a>
        <span className="topbar-note">NARZĘDZIE DO ANALIZY GRAFIKÓW</span>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> WORKFORCE ANALYTICS</div>
        <h1>Grafik pod kontrolą.<br /><span>Godzina po godzinie.</span></h1>
        <p className="hero-copy">
          Dodaj zdjęcia grafiku, a przygotujemy dane do analizy obsady
          pracowników w poszczególnych godzinach.
        </p>

        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onInputChange}
            hidden
          />
          <div className="upload-icon">↑</div>
          <h2>Dodaj zdjęcia grafiku</h2>
          <p>Przeciągnij pliki tutaj lub wybierz je z urządzenia</p>
          <button className="button button-light" onClick={() => inputRef.current?.click()}>
            Wybierz zdjęcia
          </button>
          <span className="upload-hint">JPG, PNG lub WEBP · maksymalnie 5 zdjęć</span>
        </div>

        {images.length > 0 && (
          <section className="files-section">
            <div className="section-heading">
              <div>
                <span className="mini-label">MATERIAŁ ŹRÓDŁOWY</span>
                <h2>Wybrane zdjęcia <span className="count">{images.length}/{MAX_IMAGES}</span></h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  images.forEach((image) => URL.revokeObjectURL(image.preview));
                  setImages([]);
                }}
                disabled={isProcessing}
              >
                Usuń wszystkie
              </button>
            </div>

            <div className="image-grid">
              {images.map((image, index) => (
                <article className="image-card" key={image.id}>
                  <div className="preview-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.preview} alt={`Zdjęcie grafiku ${index + 1}`} />
                    <button
                      className="remove-button"
                      onClick={() => removeImage(image.id)}
                      disabled={isProcessing}
                      aria-label="Usuń zdjęcie"
                    >×</button>
                  </div>
                  <div className="image-meta">
                    <span>ARKUSZ {String(index + 1).padStart(2, "0")}</span>
                    <span className={`status status-${image.status}`}>
                      {image.status === "ready" && "Gotowe"}
                      {image.status === "processing" && "Odczytuję…"}
                      {image.status === "done" && "Odczyt zakończony"}
                      {image.status === "error" && "Błąd odczytu"}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <button
              className="button button-primary analyze-button"
              onClick={runOcr}
              disabled={isProcessing || images.length === 0}
            >
              {isProcessing ? "Odczytuję tekst ze zdjęć…" : "Rozpocznij odczyt zdjęć"}
              <span>↗</span>
            </button>
            {completedCount > 0 && (
              <p className="privacy-note">
                Odczytano {completedCount} z {images.length} zdjęć. Przetwarzanie odbywa się w Twojej przeglądarce.
              </p>
            )}
          </section>
        )}

        {images.some((image) => image.text !== undefined) && (
          <section className="ocr-section">
            <div className="section-heading">
              <div>
                <span className="mini-label">WYNIK ETAPU 1</span>
                <h2>Tekst rozpoznany ze zdjęć</h2>
              </div>
              <span className="review-label">WYMAGA WERYFIKACJI</span>
            </div>
            <p className="ocr-intro">
              To wstępny odczyt OCR, a nie jeszcze policzona obsada. Zdjęcia grafiku
              mogą zawierać skreślenia i odręczne poprawki, dlatego wynik trzeba zweryfikować.
            </p>
            {images.filter((image) => image.text !== undefined).map((image, index) => (
              <details className="ocr-result" key={image.id}>
                <summary>Zdjęcie {index + 1} <span>Podgląd rozpoznanego tekstu</span></summary>
                <pre>{image.text || "Nie udało się rozpoznać tekstu."}</pre>
              </details>
            ))}
          </section>
        )}
      </section>

      <footer className="footer">
        <span>CHATELIER SOLUTIONS</span>
        <span>Prościej analizować. Lepiej planować.</span>
      </footer>
    </main>
  );
}
