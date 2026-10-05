"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function LinkCopy({ value, label, ru, multiline = false }: { value: string; label: string; ru: boolean; multiline?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<{ value: string; copied: boolean } | null>(null);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setFeedback(null), 3500); return () => clearTimeout(timer); }, [feedback]);
  const current = feedback?.value === value ? feedback : null;
  async function copy() {
    try { await navigator.clipboard.writeText(value); setFeedback({ value, copied: true }); }
    catch { (input.current || textarea.current)?.select(); setFeedback({ value, copied: false }); }
  }
  return <div className="link-copy"><label><span>{label}</span>{multiline ? <textarea ref={textarea} readOnly rows={3} value={value} onFocus={event => event.currentTarget.select()}/> : <input ref={input} readOnly value={value} onFocus={event => event.currentTarget.select()}/>}</label><div className="link-copy-actions"><small className="copy-feedback" role="status">{current ? (current.copied ? (ru ? "Ссылка скопирована" : "Link copied") : (ru ? "Нажмите Ctrl+C / ⌘C, чтобы скопировать выделенную ссылку." : "Press Ctrl+C / ⌘C to copy the selected link.")) : ""}</small><button type="button" className="secondary-action" disabled={!value} onClick={copy}>{current?.copied ? <Check size={15}/> : <Copy size={15}/>}<span>{ru ? "Копировать" : "Copy"}</span></button></div></div>;
}
