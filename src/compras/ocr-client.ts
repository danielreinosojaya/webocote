export async function ocrImages(
  images: string[],
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js");
  const parts: string[] = [];
  const total = images.length;

  for (let i = 0; i < total; i++) {
    const result = await Tesseract.recognize(images[i], "spa", {
      logger: (m) => {
        if (m.status === "recognizing text" && onProgress) {
          const pageProgress = (i + m.progress) / total;
          onProgress(pageProgress);
        }
      },
    });
    parts.push(result.data.text);
  }

  return parts.join("\n\n").trim();
}
