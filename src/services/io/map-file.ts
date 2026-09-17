export const MAP_JSON_FORMAT = "fmg-json";

export interface MapJsonFile {
  format: typeof MAP_JSON_FORMAT;
  version: string;
  records: string[];
}

export function wrapMapFile(records: string, version: string): string {
  return JSON.stringify({ format: MAP_JSON_FORMAT, version, records: records.split("\r\n") } satisfies MapJsonFile);
}

export function parseMapJson(text: string): MapJsonFile | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return null;
  try {
    const json = JSON.parse(trimmed) as Partial<MapJsonFile>;
    if (json.format !== MAP_JSON_FORMAT || !Array.isArray(json.records)) return null;
    return { format: MAP_JSON_FORMAT, version: json.version || "", records: json.records };
  } catch {
    return null;
  }
}
