function pdfObject(number: number, body: string | Uint8Array) {
  return Buffer.concat([
    Buffer.from(`${number} 0 obj\n`, "latin1"),
    typeof body === "string" ? Buffer.from(body, "latin1") : Buffer.from(body),
    Buffer.from("\nendobj\n", "latin1"),
  ]);
}

function escapePdfLiteral(value: string) {
  return value.replace(/([\\()])/g, "\\$1");
}

export function textPdfBytes(value: string, unreferencedStream?: Uint8Array) {
  const content = Buffer.from(
    `BT /F1 12 Tf 72 720 Td (${escapePdfLiteral(value)}) Tj ET`,
    "latin1",
  );
  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfObject(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    pdfObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    pdfObject(
      5,
      Buffer.concat([
        Buffer.from(`<< /Length ${content.byteLength} >>\nstream\n`, "latin1"),
        content,
        Buffer.from("\nendstream", "latin1"),
      ]),
    ),
  ];

  if (unreferencedStream) {
    objects.push(
      pdfObject(
        6,
        Buffer.concat([
          Buffer.from(
            `<< /Length ${unreferencedStream.byteLength} >>\nstream\n`,
            "latin1",
          ),
          Buffer.from(unreferencedStream),
          Buffer.from("\nendstream", "latin1"),
        ]),
      ),
    );
  }

  const header = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1");
  const offsets: number[] = [];
  let offset = header.byteLength;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.byteLength;
  }
  const xrefOffset = offset;
  const xref = Buffer.from(
    [
      "xref",
      `0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.map(
        (value) => `${value.toString().padStart(10, "0")} 00000 n `,
      ),
      "trailer",
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      "startxref",
      String(xrefOffset),
      "%%EOF",
    ].join("\n"),
    "latin1",
  );
  return new Uint8Array(Buffer.concat([header, ...objects, xref]));
}
