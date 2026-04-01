import fs from "fs/promises";
import path from "path";

type PDFFontLike = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

type PDFPageLike = {
  drawText: (
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      font: unknown;
      color: unknown;
    }
  ) => void;
};

type PDFDocumentLike = {
  embedFont: (fontName: unknown) => Promise<PDFFontLike>;
  addPage: (size: [number, number]) => PDFPageLike;
  save: () => Promise<Uint8Array>;
};

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib") as {
  PDFDocument: { create: () => Promise<PDFDocumentLike> };
  StandardFonts: { Helvetica: unknown; HelveticaBold: unknown };
  rgb: (red: number, green: number, blue: number) => unknown;
};

interface PdfExportInput {
  id: string;
  title: string;
  sourceType: string;
  requestedAction: string;
  createdAt: string;
  sourceReference: string;
  body: string;
}

export async function exportRecordPdf(input: PdfExportInput): Promise<string> {
  const outputDir = path.resolve(process.cwd(), "output", "pdf");
  const pdfPath = path.join(outputDir, `${input.id}.pdf`);

  await fs.mkdir(outputDir, { recursive: true });
  const pdfBytes = await buildPdfBytes(input);
  await fs.writeFile(pdfPath, pdfBytes);

  return pdfPath;
}

async function buildPdfBytes(input: PdfExportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const bodyFontSize = 11;
  const metaFontSize = 9.5;
  const titleFontSize = 18;
  const lineGap = 4;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }
  };

  const drawParagraph = (
    text: string,
    options?: {
      font?: PDFFontLike;
      size?: number;
      color?: unknown;
      spacingAfter?: number;
    }
  ) => {
    const font = options?.font ?? regularFont;
    const size = options?.size ?? bodyFontSize;
    const color = options?.color ?? rgb(0.1, 0.1, 0.1);
    const spacingAfter = options?.spacingAfter ?? 8;
    const lines = wrapText(text, font, size, contentWidth);
    const lineHeight = size + lineGap;

    ensureSpace(lines.length * lineHeight + spacingAfter);

    for (const line of lines) {
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size,
        font,
        color
      });
      cursorY -= lineHeight;
    }

    cursorY -= spacingAfter;
  };

  drawParagraph(input.title, {
    font: boldFont,
    size: titleFontSize,
    color: rgb(0.08, 0.08, 0.08),
    spacingAfter: 14
  });

  const metaLines = [
    `Record ID: ${input.id}`,
    `Source type: ${input.sourceType}`,
    `Action: ${input.requestedAction}`,
    `Created: ${input.createdAt}`,
    `Source reference: ${input.sourceReference}`
  ];

  for (const line of metaLines) {
    drawParagraph(line, {
      size: metaFontSize,
      color: rgb(0.3, 0.3, 0.3),
      spacingAfter: 2
    });
  }

  cursorY -= 10;

  const blocks = input.body
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (/^[A-Z][A-Za-z\s-]+$/.test(block)) {
      drawParagraph(block, {
        font: boldFont,
        size: 13,
        color: rgb(0.1, 0.1, 0.1),
        spacingAfter: 6
      });
      continue;
    }

    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      drawParagraph(line, {
        size: bodyFontSize,
        spacingAfter: 4
      });
    }

    cursorY -= 4;
  }

  return pdf.save();
}

function wrapText(text: string, font: PDFFontLike, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);

    if (candidateWidth <= maxWidth || current.length === 0) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [text];
}
