# Excel exports in knowledge bases (DEO-52)

## Problem and implementation

The upload picker already accepted Excel, but knowledge ingestion flattened the
workbook to Markdown before applying the prose chunker. A retrieved fragment could
lose its column labels and its worksheet/row context. The chat attachment extraction
path also imposed a separate text ceiling. Reindexing used the same flattening path.

XLSX and XLSM knowledge uploads now use ExcelJS to read stored cell values. No model,
provider-specific API, macro execution, formula calculation or network link fetching
is involved. The existing embedding/search pipeline consumes ordinary encrypted
text chunks, so the change is independent of the chat model and SDK.

Each visible sheet is treated as one table. Its first non-empty row is the header.
Each subsequent non-empty physical Excel row produces one or more bounded chunks.
Every field includes its column letter and header (duplicate and blank headers are
unambiguous), and every chunk includes the sheet name and physical row number.
Long fields repeat their label in every fragment; all characters are retained.
Different rows never share a chunk. Overlap is unnecessary for these records.
The existing document citation identifies the workbook; chunk text identifies the
sheet and row. Coordinates in metadata contain no unencrypted cell values/names.

Upload (multipart and chunked), ZIP expansion and original re-extraction share this
path. Renaming a document works because its canonical spreadsheet MIME is retained.
Failed re-extraction preserves the previous chunks transactionally. Existing files
need **Reindex** to use this extraction; no migration or automatic re-embedding.

## Preparation and explicit limits

- Use XLSX (or XLSM with saved cell values), a header row, then one incident/request
  per row. Remove title banners, totals/subtotals and unrelated blocks first.
- Hidden sheets are excluded and reported. Hidden rows/columns remain included;
  a spreadsheet filter is not an access-control boundary.
- Formula cells use cached results, including zero/false. Missing results and Excel
  errors are explicit. Recalculate/save the workbook before uploading. Macros are
  not run. Dates become ISO strings; numeric display formats (currency/percent/zero
  padding) are not applied. Store identifiers as text and units in column headers.
- Merged regions retain their stored cell value only; charts/images are not indexed.
- Per workbook: 16 MiB compressed, 64 MiB actually inflated, 2,000 archive entries,
  10,000 non-empty rows including headers, 256 columns, 8,000 chunks and 8 million
  chunk characters. Whichever limit is reached first rejects the whole workbook.
  Split large exports into smaller files. These are application bounds, not an
  assurance that the in-memory parser uses only 64 MiB of RAM.
- CSV/TSV, ODS, XLS and XLSB keep the existing generic extraction behavior. Convert
  them to XLSX to obtain the row-preserving behavior. This PR does not claim all
  spreadsheet formats have equivalent extraction fidelity.

## Research and analyst scope

Research consulted 2026-09-19, using primary documentation:

1. [Microsoft: RAG chunking phase](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-chunking-phase)
   explains why chunk boundaries must match document structure and preserve the
   context needed by retrieval. This motivates labeled, row-oriented chunks rather
   than slicing a serialized table as prose.
2. [Microsoft: RAG and structured data](https://learn.microsoft.com/en-us/azure/databricks/agents/retrieval-augmented-generation)
   describes retrieval through vector, keyword and SQL sources.
3. [LlamaIndex: SQL retriever source](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/indices/struct_store/sql_retriever.py)
   implements table-context retrieval and SQL execution for structured questions.
4. [ExcelJS documentation](https://github.com/exceljs/exceljs/blob/master/README.md)
   documents worksheet iteration, cell types and saved formula results. ExcelJS
   cannot calculate formula results; retaining unavailable-result markers is safer
   than guessing values. The dependency is locked in package-lock.json.
5. [Docling supported formats](https://docling-project.github.io/docling/usage/supported_formats/)
   includes XLSX in a unified document conversion model. A document converter is an
   alternative for mixed layouts, but would not by itself provide exact analytics.

Engineering conclusion: this enables citing incidents, finding similar problems
and inspecting automation opportunities from retrieved examples. Top-k retrieval
cannot establish total incident counts, percentages, SLA compliance or complete
category rankings. The extraction warning explicitly identifies this limitation;
it does not enforce the model's reasoning.

A future exact-analysis tool should query a typed, versioned table with tenant/KB
permissions checked before each query, bounded read-only operations and provenance
for the full population/filter. It should report row count, missing values, date
range and freshness. It must not compute corpus-wide statistics from retrieved
snippets or run unrestricted model-generated SQL. That execution/storage layer is
outside this ingestion fix.

## Validation

Tests cover genuine generated workbooks: multiple/hidden sheets, physical gaps,
sparse/duplicate headers, values and formula cases, bounded long-field splitting,
ZIP import, rename/re-extraction and explicit rejection. PostgreSQL integration
covers encrypted persistence, retrieval of an incident with its labels, replacement
chunks, and preserving old content on failure. The end-to-end scenario uploads an
Excel export through the knowledge UI, waits for the worker, searches its content,
checks the original and reindexes it.
