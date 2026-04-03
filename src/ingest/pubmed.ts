import axios from "axios";
import { AppError } from "../utils/errors";
import type { IngestedSource } from "../types";

interface PubMedSummaryItem {
  uid: string;
  title?: string;
  pubdate?: string;
  fulljournalname?: string;
  authors?: Array<{ name: string }>;
}

interface PubMedSummaryResponse {
  result?: Record<string, PubMedSummaryItem>;
}

export async function ingestPubMed(input: string): Promise<IngestedSource> {
  const pmid = extractPmid(input);
  let summaryResponse;
  let abstractResponse;

  try {
    [summaryResponse, abstractResponse] = await Promise.all([
      axios.get<PubMedSummaryResponse>(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
        {
          params: {
            db: "pubmed",
            id: pmid,
            retmode: "json"
          },
          timeout: 30000
        }
      ),
      axios.get<string>(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        {
          params: {
            db: "pubmed",
            id: pmid,
            rettype: "abstract",
            retmode: "text"
          },
          timeout: 30000
        }
      )
    ]);
  } catch (error) {
    throw mapPubMedError(error, pmid);
  }

  const summary = summaryResponse.data.result?.[pmid];
  const normalizedText = abstractResponse.data.trim();

  if (!summary) {
    throw new AppError(
      `PubMed did not return a record for PMID ${pmid}. Check the identifier and try again.`
    );
  }

  if (!normalizedText || /^pmid:\s*\d+/i.test(normalizedText)) {
    throw new AppError(
      `PubMed record ${pmid} was found, but no abstract text was returned. Try another PMID or use a direct article URL if you need full-text analysis.`
    );
  }

  return {
    sourceType: "pubmed",
    sourceReference: `PMID:${pmid}`,
    rawInput: input,
    normalizedText,
    title: summary?.title,
    authors: (summary?.authors ?? []).map((author) => author.name),
    publication: summary?.fulljournalname,
    date: summary?.pubdate,
    completeness: normalizedText ? "abstract_only" : "unknown",
    tags: ["pubmed", "research", summary?.fulljournalname ?? "journal"].filter(Boolean)
  };
}

export function extractPmid(input: string): string {
  const matched = input.match(/(?:PMID:\s*)?(\d{5,12})/i);
  if (!matched) {
    throw new AppError("Could not find a PubMed ID in that input. Try `file PMID:39371694` or paste a PubMed URL.");
  }

  return matched[1];
}

function mapPubMedError(error: unknown, pmid: string): AppError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    if (statusCode === 404) {
      return new AppError(`PubMed could not find PMID ${pmid} (HTTP 404). Check the identifier and try again.`);
    }

    if (statusCode === 429) {
      return new AppError(
        `PubMed rate-limited the request for PMID ${pmid} (HTTP 429). Try again in a moment.`
      );
    }

    if (error.code === "ECONNABORTED") {
      return new AppError(
        `The PubMed request for PMID ${pmid} timed out. Try again in a moment.`
      );
    }

    return new AppError(
      `PubMed could not be reached for PMID ${pmid}${statusCode ? ` (HTTP ${statusCode})` : ""}. Try again in a moment or use a source URL instead.`
    );
  }

  return new AppError(`An unexpected error occurred while trying to fetch PubMed record ${pmid}.`);
}
