# Chatelier Schedule Analyzer

A browser-based schedule image reader built with Next.js, TypeScript and Tesseract.js.

## Current scope

- Upload up to five schedule photos.
- Run Polish and English OCR locally in the browser.
- Inspect the recognized text before schedule parsing is added.

No OpenAI API key or paid OCR API is used.

## Run locally

```bash
npm install
npm run dev
```

## Important

OCR output is a draft and must be checked. Handwritten changes, crossed-out shifts and angled photos can reduce recognition accuracy. Hourly staffing calculations and review workflow are the next implementation stage.
