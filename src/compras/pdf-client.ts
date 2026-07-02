import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

const MIN_TEXT_CHARS = 80;
const RENDER_SCALE = 2;

export interface PdfProcessResult {
  text: string;
  pages: string[];
  esEscaneado: boolean;
  numPaginas: number;
}

async function renderPageToBase64(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear canvas");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function processPdfFile(file: File): Promise<PdfProcessResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    textParts.push(pageText);
  }

  const text = textParts.join("\n\n").trim();
  const esEscaneado = text.length < MIN_TEXT_CHARS;
  const pageImages: string[] = [];

  if (esEscaneado) {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      pageImages.push(await renderPageToBase64(page));
    }
  }

  return {
    text,
    pages: pageImages,
    esEscaneado,
    numPaginas: pdf.numPages,
  };
}

export async function processImageFile(file: File): Promise<PdfProcessResult> {
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], { type: file.type });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    text: "",
    pages: [dataUrl],
    esEscaneado: true,
    numPaginas: 1,
  };
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
