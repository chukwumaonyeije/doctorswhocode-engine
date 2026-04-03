export function normalizeSourceReference(sourceReference: string): string {
  const trimmed = stripTrailingPunctuation(sourceReference.trim());
  if (!trimmed) {
    return trimmed;
  }

  if (/^(?:PMID:\s*)?\d{5,12}$/i.test(trimmed)) {
    const matched = trimmed.match(/(\d{5,12})/);
    return `PMID:${matched?.[1] ?? trimmed}`;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const canonicalPubmed = normalizePubmedUrl(url);
    if (canonicalPubmed) {
      return canonicalPubmed;
    }

    const canonicalYouTube = normalizeYouTubeUrl(url);
    if (canonicalYouTube) {
      return canonicalYouTube;
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    url.hash = "";
    stripTrackingParams(url);
    sortSearchParams(url);
    url.pathname = normalizePathname(url.pathname);
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function buildSourceReferenceCandidates(sourceReference: string): string[] {
  const trimmed = stripTrailingPunctuation(sourceReference.trim());
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  const normalized = normalizeSourceReference(trimmed);
  candidates.add(trimmed);
  candidates.add(normalized);

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const rawUrl = new URL(trimmed);
      rawUrl.hash = "";
      candidates.add(rawUrl.toString());
      rawUrl.pathname = normalizePathname(rawUrl.pathname);
      sortSearchParams(rawUrl);
      candidates.add(rawUrl.toString());
    } catch {
      // Ignore parse failures and keep the other candidates.
    }
  }

  return [...candidates].filter(Boolean);
}

function normalizePubmedUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const pubmedMatch =
    (host.includes("pubmed.ncbi.nlm.nih.gov") && url.pathname.match(/\/(\d{5,12})(?:\/)?$/)) ||
    (host === "www.ncbi.nlm.nih.gov" && url.pathname.match(/\/pubmed\/(\d{5,12})(?:\/)?$/));
  if (!pubmedMatch) {
    return null;
  }

  return `PMID:${pubmedMatch[1]}`;
}

function normalizeYouTubeUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const videoId =
    (host === "youtu.be" && url.pathname.split("/").filter(Boolean)[0]) ||
    ((host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") &&
      getYouTubeVideoId(url));
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

function getYouTubeVideoId(url: URL): string | null {
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }

  if (pathParts[0] === "shorts" || pathParts[0] === "embed" || pathParts[0] === "live") {
    return pathParts[1] ?? null;
  }

  return null;
}

function stripTrackingParams(url: URL): void {
  const trackingKeys = new Set([
    "si",
    "feature",
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "source"
  ]);

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingKeys.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
}

function sortSearchParams(url: URL): void {
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });

  url.search = "";
  for (const [key, value] of entries) {
    url.searchParams.append(key, value);
  }
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;]+$/, "");
}
