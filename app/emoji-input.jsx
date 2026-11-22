"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

const emojis = [
  ["😊", "ابتسامة"], ["🙂", "وجه مبتسم"], ["😍", "إعجاب"], ["😂", "ضحك"],
  ["🥰", "محبة"], ["🤩", "انبهار"], ["😉", "غمزة"], ["😅", "ابتسامة مع عرق"],
  ["❤️", "قلب أحمر"], ["🤍", "قلب أبيض"], ["💜", "قلب بنفسجي"], ["🫶", "يدان على شكل قلب"],
  ["👍", "إبهام للأعلى"], ["🙏", "يدان مضمومتان"], ["👏", "تصفيق"], ["🙌", "يدان مرفوعتان"],
  ["👋", "تلويح"], ["🤝", "مصافحة"], ["✅", "علامة صح"], ["🔥", "نار"],
  ["✨", "لمعان"], ["🎉", "احتفال"], ["🎁", "هدية"], ["🚚", "شاحنة"],
];

export default function EmojiInput({ label, value, onChange, maxLength, disabled }) {
  const [open, setOpen] = useState(false);
  const input = useRef(null);
  const trigger = useRef(null);
  const caret = useRef(null);
  const panelId = useId();

  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value, open]);

  function insert(emoji) {
    const field = input.current;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (maxLength != null && next.length > maxLength) return;

    caret.current = start + emoji.length;
    onChange(next);
    setOpen(false);
    field.focus();
  }

  return (
    <div
      onBlur={event => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        setOpen(false);
        trigger.current.focus();
      }}
    >
      <textarea
        ref={input}
        aria-label={label}
        placeholder="اكتب ردك على العميل..."
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={3}
        maxLength={maxLength}
        disabled={disabled}
      />
      <div className="reply-emoji">
        <button
          ref={trigger}
          className="reply-emoji-trigger"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => setOpen(previous => !previous)}
        >
          <span aria-hidden="true">🙂</span> إضافة إيموجي
        </button>
        <div id={panelId} className="reply-emoji-options" role="group" aria-label="اختَر إيموجي" hidden={!open}>
          {emojis.map(([emoji, name]) => (
            <button key={emoji} type="button" aria-label={name} title={name} disabled={disabled}
              onClick={() => insert(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
