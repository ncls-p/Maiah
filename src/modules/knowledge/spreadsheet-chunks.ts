/** Server-produced chunks. Provenance stays inside encrypted content. */
export type KnowledgeSourceChunk = {
  content: string;
  metadata: {
    sourceFormat: "xlsx";
    sheetIndex: number;
    row: number;
    part: number;
  };
};

export function chunkSpreadsheetRow(input: {
  sheet: string;
  sheetIndex: number;
  row: number;
  fields: Array<{ column: string; header: string; value: string }>;
  maxCharacters: number;
  remainingChunks?: number;
  remainingCharacters?: number;
}): KnowledgeSourceChunk[] {
  const source = `Sheet ${JSON.stringify(input.sheet)}; Excel row ${input.row}`;
  const chunks: KnowledgeSourceChunk[] = [];
  let body = "";
  let textLength = 0;
  const prefix = `${source}\n`;
  const budget = input.maxCharacters - prefix.length;
  const flush = () => {
    if (!body) return;
    textLength += prefix.length + body.length;
    if (
      chunks.length >= (input.remainingChunks ?? 8_000) ||
      textLength > (input.remainingCharacters ?? 8_000_000)
    ) {
      throw new Error(
        "Excel export exceeds the indexing limit (8,000 chunks / 8 million characters). Split the export into smaller files.",
      );
    }
    chunks.push({
      content: prefix + body,
      metadata: {
        sourceFormat: "xlsx",
        sheetIndex: input.sheetIndex,
        row: input.row,
        part: chunks.length + 1,
      },
    });
    body = "";
  };
  for (const field of input.fields) {
    // Column letters disambiguate blank and duplicate headers. Repeat the label
    // on every fragment of a long field; never detach its value from its meaning.
    const label = `${field.column} ${JSON.stringify(field.header)}: `;
    const capacity = budget - label.length - 1;
    if (capacity < 16)
      throw new Error(
        "Spreadsheet headers exceed the configured chunk size. Increase the chunk size or shorten the headers.",
      );
    const value = field.value || "[empty]";
    for (let offset = 0; offset < value.length; ) {
      let end = Math.min(offset + capacity, value.length);
      // Do not hand isolated UTF-16 surrogates to embedding providers.
      if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
      const line = label + value.slice(offset, end) + "\n";
      offset = end;
      if (body.length + line.length > budget) flush();
      body += line;
    }
  }
  flush();
  return chunks;
}
