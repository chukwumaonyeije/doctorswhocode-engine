import axios from "axios";
import fs from "fs/promises";
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
  pdfDocEncodingDecode
} from "pdf-lib";
import { AppError } from "../utils/errors";
import type { IngestedSource } from "../types";

const PDF_DOWNLOAD_TIMEOUT_MS = 45000;
const MAX_PDF_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export async function ingestPdfUrl(url: string): Promise<IngestedSource> {
  let response;

  try {
    response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: PDF_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_PDF_DOWNLOAD_BYTES,
      maxBodyLength: MAX_PDF_DOWNLOAD_BYTES,
      validateStatus: () => true
    });
  } catch (error) {
    throw mapPdfFetchError(error, url);
  }

  if (response.status >= 400) {
    throw new AppError(`The PDF URL could not be fetched${response.status ? ` (HTTP ${response.status})` : ""}.`);
  }

  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  if (!looksLikePdfUrl(url) && !contentType.includes("pdf")) {
    throw new AppError("That URL did not look like a PDF document. Send a direct PDF link or use the normal URL workflow.");
  }

  return ingestPdfBytes(Buffer.from(response.data), {
    sourceReference: url,
    rawInput: url
  });
}

export async function ingestPdfFilePath(filePath: string): Promise<IngestedSource> {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    throw new AppError("No PDF file path was provided.");
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(trimmedPath);
  } catch (error) {
    throw mapPdfFileReadError(error, trimmedPath);
  }

  if (bytes.byteLength === 0) {
    throw new AppError("The PDF file was empty.");
  }

  if (bytes.byteLength > MAX_PDF_DOWNLOAD_BYTES) {
    throw new AppError("The PDF file was too large to process. Try a file under 25 MB.");
  }

  return ingestPdfBytes(bytes, {
    sourceReference: trimmedPath,
    rawInput: trimmedPath
  });
}

export async function ingestPdfBase64(params: {
  base64: string;
  filename?: string;
  title?: string;
}): Promise<IngestedSource> {
  const bytes = decodeBase64Pdf(params.base64);
  const filename = params.filename?.trim() || "uploaded.pdf";

  return ingestPdfBytes(bytes, {
    sourceReference: `upload:${filename}`,
    rawInput: filename,
    fallbackTitle: params.title?.trim() || stripPdfExtension(filename)
  });
}

async function ingestPdfBytes(
  bytes: Uint8Array,
  params: {
    sourceReference: string;
    rawInput: string;
    fallbackTitle?: string;
  }
): Promise<IngestedSource> {
  let pdfDoc: PDFDocument;

  try {
    pdfDoc = await PDFDocument.load(bytes, {
      updateMetadata: false
    });
  } catch (error) {
    throw mapPdfParseError(error);
  }

  const pageTexts = pdfDoc.getPages().map((page, index) => extractPdfPageText(page.node, index + 1));
  const extractedText = pageTexts.filter(Boolean).join("\n\n").trim();
  const fieldText = extractPdfFormFieldText(pdfDoc);
  const normalizedText = [extractedText, fieldText].filter(Boolean).join("\n\n").trim();

  if (!normalizedText) {
    throw new AppError(
      "The PDF loaded successfully, but no extractable text layer was found. It may be scanned or image-only. Try OCR text or paste the important pages directly."
    );
  }

  const title = pdfDoc.getTitle()?.trim() || params.fallbackTitle || deriveTitleFromSource(params.sourceReference);
  const author = pdfDoc.getAuthor()?.trim();
  const subject = pdfDoc.getSubject()?.trim();
  const keywords = pdfDoc
    .getKeywords()
    ?.split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const creationDate = pdfDoc.getCreationDate()?.toISOString().slice(0, 10);
  const pageCount = pdfDoc.getPageCount();

  return {
    sourceType: "pdf_document",
    sourceReference: params.sourceReference,
    rawInput: params.rawInput,
    normalizedText,
    title,
    authors: author ? [author] : [],
    publication: subject || "PDF document",
    date: creationDate,
    completeness: normalizedText.length > 2500 ? "full_text" : "partial",
    tags: buildPdfTags(params.sourceReference, keywords),
    metadata: {
      pageCount,
      pdfExtractionStatus: "text_extracted",
      pdfHasTextLayer: Boolean(extractedText),
      pdfFormFieldTextIncluded: Boolean(fieldText),
      pdfKeywords: keywords ?? [],
      pdfTitle: title,
      pdfSubject: subject,
      pdfAuthor: author
    }
  };
}

function extractPdfPageText(pageNode: any, pageNumber: number): string {
  const contents = pageNode?.Contents?.();
  if (!contents) {
    return "";
  }

  const streams = resolvePageStreams(contents);
  const textChunks = streams
    .map((stream) => decodePageStream(stream))
    .flatMap((content) => extractTextOperators(content))
    .map(cleanExtractedSegment)
    .filter(Boolean);

  if (textChunks.length === 0) {
    return "";
  }

  return [`Page ${pageNumber}`, textChunks.join("\n")].join("\n");
}

function resolvePageStreams(contents: any): Array<{ dict: any; getContents: () => Uint8Array }> {
  if (contents instanceof PDFRawStream) {
    return [contents];
  }

  if (contents instanceof PDFArray) {
    const streams: Array<{ dict: any; getContents: () => Uint8Array }> = [];
    for (let index = 0; index < contents.size(); index += 1) {
      const stream = contents.lookup(index, PDFRawStream);
      if (stream) {
        streams.push(stream);
      }
    }
    return streams;
  }

  return [];
}

function decodePageStream(stream: { dict: any; getContents: () => Uint8Array }): string {
  const decoded = decodePDFRawStream(stream as any).decode();

  return Buffer.from(decoded).toString("latin1");
}

function extractTextOperators(content: string): string[] {
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [];
  const extracted: string[] = [];

  for (const block of blocks) {
    const textMatches = [
      ...collectOperatorStrings(block, /(\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>)\s*Tj/g),
      ...collectOperatorStrings(block, /(\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>)\s*['"]/g)
    ];

    const arrayMatches = [...block.matchAll(/\[(.*?)\]\s*TJ/gs)].flatMap((match) =>
      collectArrayStrings(match[1] ?? "")
    );

    const combined = [...textMatches, ...arrayMatches].map(cleanExtractedSegment).filter(Boolean);
    if (combined.length > 0) {
      extracted.push(combined.join(" "));
    }
  }

  return extracted;
}

function collectOperatorStrings(content: string, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const match of content.matchAll(pattern)) {
    const decoded = decodePdfStringToken(match[1]);
    if (decoded) {
      values.push(decoded);
    }
  }
  return values;
}

function collectArrayStrings(content: string): string[] {
  const values: string[] = [];
  const tokenPattern = /\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>/g;
  for (const match of content.matchAll(tokenPattern)) {
    const decoded = decodePdfStringToken(match[0]);
    if (decoded) {
      values.push(decoded);
    }
  }
  return values;
}

function decodePdfStringToken(token: string | undefined): string {
  if (!token) {
    return "";
  }

  if (token.startsWith("(") && token.endsWith(")")) {
    return decodePdfLiteralString(token.slice(1, -1));
  }

  if (token.startsWith("<") && token.endsWith(">")) {
    return decodePdfHexString(token.slice(1, -1));
  }

  return "";
}

function decodePdfLiteralString(value: string): string {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current !== "\\") {
      bytes.push(current.charCodeAt(0));
      continue;
    }

    const next = value[index + 1];
    if (!next) {
      break;
    }

    if (/[0-7]/.test(next)) {
      let octal = next;
      let cursor = index + 2;
      while (cursor < value.length && octal.length < 3 && /[0-7]/.test(value[cursor])) {
        octal += value[cursor];
        cursor += 1;
      }
      bytes.push(parseInt(octal, 8));
      index = cursor - 1;
      continue;
    }

    const escaped = decodeEscapedPdfChar(next);
    if (escaped !== null) {
      bytes.push(escaped);
    }
    index += 1;
  }

  return pdfDocEncodingDecode(Uint8Array.from(bytes));
}

function decodeEscapedPdfChar(value: string): number | null {
  switch (value) {
    case "n":
      return 0x0a;
    case "r":
      return 0x0d;
    case "t":
      return 0x09;
    case "b":
      return 0x08;
    case "f":
      return 0x0c;
    case "(":
    case ")":
    case "\\":
      return value.charCodeAt(0);
    case "\n":
    case "\r":
      return null;
    default:
      return value.charCodeAt(0);
  }
}

function decodePdfHexString(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  const normalized = compact.length % 2 === 0 ? compact : `${compact}0`;
  return pdfDocEncodingDecode(Uint8Array.from(Buffer.from(normalized, "hex")));
}

function cleanExtractedSegment(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractPdfFormFieldText(pdfDoc: PDFDocument): string {
  try {
    const form = pdfDoc.getForm();
    const values = form
      .getFields()
      .map((field) => {
        const fieldName = field.getName();
        const maybeText = "getText" in field && typeof (field as any).getText === "function" ? String((field as any).getText() ?? "").trim() : "";
        const maybeOptions =
          "getSelected" in field && typeof (field as any).getSelected === "function"
            ? String(((field as any).getSelected() ?? []).join(", ")).trim()
            : "";
        const value = maybeText || maybeOptions;
        return value ? `${fieldName}: ${value}` : "";
      })
      .filter(Boolean);

    if (values.length === 0) {
      return "";
    }

    return ["PDF form fields", ...values].join("\n");
  } catch {
    return "";
  }
}

function buildPdfTags(sourceReference: string, keywords?: string[]): string[] {
  return [
    "pdf",
    "document",
    ...extractSourceReferenceTags(sourceReference),
    ...(keywords ?? []).slice(0, 3)
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function extractSourceReferenceTags(sourceReference: string): string[] {
  if (!/^https?:\/\//i.test(sourceReference)) {
    return [];
  }

  try {
    return [new URL(sourceReference).hostname.replace(/^www\./i, "")];
  } catch {
    return [];
  }
}

function deriveTitleFromSource(sourceReference: string): string {
  if (/^https?:\/\//i.test(sourceReference)) {
    try {
      const pathname = new URL(sourceReference).pathname.split("/").filter(Boolean).pop();
      if (pathname) {
        return stripPdfExtension(pathname);
      }
    } catch {
      return "PDF Document";
    }
  }

  return stripPdfExtension(sourceReference.split(/[\\/]/).pop() || "PDF Document");
}

function stripPdfExtension(value: string): string {
  return value.replace(/\.pdf$/i, "") || "PDF Document";
}

function decodeBase64Pdf(value: string): Uint8Array {
  const cleaned = value.replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!cleaned) {
    throw new AppError("No PDF bytes were provided.");
  }

  try {
    return Uint8Array.from(Buffer.from(cleaned, "base64"));
  } catch {
    throw new AppError("The provided PDF payload was not valid base64.");
  }
}

function looksLikePdfUrl(url: string): boolean {
  return /\.pdf(?:[?#].*)?$/i.test(url);
}

function mapPdfFetchError(error: unknown, url: string): AppError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    if (error.code === "ECONNABORTED") {
      return new AppError("The PDF download timed out. Try again, or use a smaller file.");
    }

    return new AppError(
      `The PDF could not be downloaded from ${url}${statusCode ? ` (HTTP ${statusCode})` : ""}.`
    );
  }

  return new AppError("An unexpected error occurred while fetching the PDF.");
}

function mapPdfParseError(error: unknown): AppError {
  if (error instanceof Error) {
    if (/encrypted/i.test(error.message)) {
      return new AppError("This PDF appears to be encrypted and could not be processed.");
    }

    return new AppError(`The PDF could not be parsed: ${error.message}`);
  }

  return new AppError("The PDF could not be parsed.");
}

function mapPdfFileReadError(error: unknown, filePath: string): AppError {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "ENOENT") {
      return new AppError(`The PDF file could not be found at ${filePath}.`);
    }

    if (code === "EACCES" || code === "EPERM") {
      return new AppError(`The PDF file at ${filePath} could not be read because access was denied.`);
    }
  }

  if (error instanceof Error) {
    return new AppError(`The PDF file at ${filePath} could not be read: ${error.message}`);
  }

  return new AppError(`The PDF file at ${filePath} could not be read.`);
}
