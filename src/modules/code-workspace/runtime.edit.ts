export type ExactTextEdit = { oldText: string; newText: string };

type LocatedEdit = ExactTextEdit & { start: number; end: number };

function locateUniqueEdit(content: string, edit: ExactTextEdit): LocatedEdit {
  const start = content.indexOf(edit.oldText);
  if (start < 0) throw new Error("Edit text was not found in the file.");
  if (content.indexOf(edit.oldText, start + edit.oldText.length) >= 0) {
    throw new Error(
      "Edit text is not unique. Include more surrounding context.",
    );
  }
  return { ...edit, start, end: start + edit.oldText.length };
}

export function applyExactTextEdits(content: string, edits: ExactTextEdit[]) {
  const located = edits.map((edit) => locateUniqueEdit(content, edit));
  const ordered = [...located].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.start < ordered[index - 1]!.end) {
      throw new Error("Edits must not overlap.");
    }
  }
  let output = content;
  for (const edit of [...located].sort(
    (left, right) => right.start - left.start,
  )) {
    output = `${output.slice(0, edit.start)}${edit.newText}${output.slice(edit.end)}`;
  }
  return output;
}
