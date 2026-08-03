import client from "./client";

interface TransliterateBatchResponse {
  values: Record<string, string>;
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
