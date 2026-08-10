import client from "./client";

interface TransliterateBatchResponse {
  values: Record<string, string>;
  language: string;
}

export interface WordCandidates {
  word: string;
  candidates: string[];
}

interface TransliterateCandidatesResponse {
  values: Record<string, WordCandidates[]>;
  language: string;
}

export async function transliterateBatch(
  values: Record<string, string>,
  language: string
): Promise<Record<string, string>> {
  if (language === "english" || !language) return values;

  const { data } = await client.post<TransliterateBatchResponse>(
    "/transliterate/batch",
    { values, language }
  );
  return data.values;
}

export async function transliterateBatchCandidates(
  values: Record<string, string>,
  language: string,
  num: number = 5
): Promise<Record<string, WordCandidates[]>> {
  if (language === "english" || !language) return {};

  const { data } = await client.post<TransliterateCandidatesResponse>(
    "/transliterate/batch-candidates",
    { values, language, num }
  );
  return data.values;
}
