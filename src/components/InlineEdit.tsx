import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  editing: boolean;
  setEditing: (b: boolean) => void;
  placeholder?: string;
}

export function InlineEdit({
  value,
  onCommit,
  className,
  editing,
  setEditing,
  placeholder,
}: Props) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  if (!editing) {
    return <span className={className}>{value}</span>;
  }

  return (
    <input
      ref={inputRef}
      className={`inline-edit ${className || ""}`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit(draft);
          setEditing(false);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
        e.stopPropagation();
      }}
      onBlur={() => {
        onCommit(draft);
        setEditing(false);
      }}
    />
  );
}
