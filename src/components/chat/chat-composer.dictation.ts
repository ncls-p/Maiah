export function appendDictationTranscript(current: string, transcript: string) {
  const next = transcript.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  return /\s$/.test(current) ? `${current}${next}` : `${current} ${next}`;
}

export function dictationLocaleFromAppLocale(locale: string) {
  return locale.toLowerCase().startsWith("fr") ? "fr-FR" : "en-US";
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function getBrowserSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return (
    candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
  );
}

export function collectFinalDictationTranscripts(
  event: SpeechRecognitionEventLike,
) {
  const parts: string[] = [];
  for (
    let index = event.resultIndex;
    index < event.results.length;
    index += 1
  ) {
    const result = event.results[index];
    if (!result?.isFinal) continue;
    const transcript = result[0]?.transcript?.trim();
    if (transcript) parts.push(transcript);
  }
  return parts;
}
