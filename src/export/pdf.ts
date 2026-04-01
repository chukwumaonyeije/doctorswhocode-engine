import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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
  const tmpDir = path.resolve(process.cwd(), "tmp", "pdfs");
  const outputDir = path.resolve(process.cwd(), "output", "pdf");
  const scriptPath = path.resolve(process.cwd(), "scripts", "export_record_pdf.py");
  const jsonPath = path.join(tmpDir, `${input.id}.json`);
  const pdfPath = path.join(outputDir, `${input.id}.pdf`);

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(jsonPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");

  await execFileAsync("python", [scriptPath, jsonPath, pdfPath], {
    cwd: process.cwd(),
    timeout: 120000
  });

  return pdfPath;
}
