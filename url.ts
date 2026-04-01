import axios from "axios";

export async function fetchCleanText(url: string) {
  const cleanUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;

  const res = await axios.get(cleanUrl, {
    headers: { Accept: "text/plain" }
  });

  return res.data;
}