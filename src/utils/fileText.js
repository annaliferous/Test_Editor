// Extracts plain text from a user-uploaded .txt or .pdf file.
export async function extractTextFromFile(file) {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  return isPdf ? extractPdfText(file) : file.text();
}

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url"))
    .default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(" "));
  }
  return pageTexts.join("\n\n");
}
