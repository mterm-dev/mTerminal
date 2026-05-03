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
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      committedRef.current = false;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  if (!editing) {
    return <span className={className}>{value}</span>;
  }

  const commit = (next: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(next);
    setEditing(false);
  };

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
          commit(draft);
        } else if (e.key === "Escape") {
          committedRef.current = true;
          setEditing(false);
        }
        e.stopPropagation();
      }}
      onBlur={() => commit(draft)}
    />
  );
}
