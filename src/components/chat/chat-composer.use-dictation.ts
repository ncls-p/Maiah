"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  appendDictationTranscript,
  collectFinalDictationTranscripts,
  dictationLocaleFromAppLocale,
  getBrowserSpeechRecognition,
  type BrowserSpeechRecognition,
} from "./chat-composer.dictation";

export function useComposerDictation({
  enabled,
  value,
  onTranscript,
}: {
  enabled: boolean;
  value: string;
  onTranscript: (next: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("chat.composer");
  const [listening, setListening] = useState(false);
  const valueRef = useRef(value);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (enabled) return;
    recognitionRef.current?.stop();
  }, [enabled]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function toggleDictation() {
    if (!enabled) return;
    const SpeechRecognition = getBrowserSpeechRecognition();
    if (!SpeechRecognition) {
      toast.error(t("dictationUnsupported"));
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = dictationLocaleFromAppLocale(locale);
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const finals = collectFinalDictationTranscripts(event);
      if (finals.length === 0) return;
      onTranscript(
        finals.reduce(
          (current, transcript) =>
            appendDictationTranscript(current, transcript),
          valueRef.current,
        ),
      );
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      toast.error(t("dictationUnsupported"));
    }
  }

  return { listening, toggleDictation };
}
