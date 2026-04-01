import axios from "axios";
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
  const [summaryResponse, abstractResponse] = await Promise.all([
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

  const summary = summaryResponse.data.result?.[pmid];
  const normalizedText = abstractResponse.data.trim();

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
    throw new Error("Unable to extract PubMed ID from input.");
  }

  return matched[1];
}
