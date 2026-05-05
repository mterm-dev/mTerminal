import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  submenu?: ReactNode;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width + margin > vw) left = Math.max(margin, vw - rect.width - margin);
    if (top + rect.height + margin > vh) top = Math.max(margin, vh - rect.height - margin);
    setPos({ left, top });
  }, [x, y, items]);

  useLayoutEffect(() => {
    if (openSub === null) {
      setSubPos(null);
      return;
    }
    const itemEl = itemRefs.current[openSub];
    const subEl = submenuRef.current;
    if (!itemEl || !subEl) return;
    const itemRect = itemEl.getBoundingClientRect();
    const subRect = subEl.getBoundingClientRect();
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = itemRect.right + 2;
    let top = itemRect.top - 4;
    if (left + subRect.width + margin > vw) {
      left = Math.max(margin, itemRect.left - subRect.width - 2);
    }
    if (top + subRect.height + margin > vh) {
      top = Math.max(margin, vh - subRect.height - margin);
    }
    setSubPos({ left, top });
  }, [openSub, items]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (submenuRef.current && submenuRef.current.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openSub !== null) {
        setOpenSub(null);
      } else {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, openSub]);

  const submenuNode =
    openSub !== null && items[openSub]?.submenu ? items[openSub].submenu : null;

  return (
    <>
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it.separator ? (
            <div key={`sep-${i}`} className="ctx-sep" role="separator" />
          ) : (
            <button
              key={it.label + i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`ctx-item ${it.danger ? "danger" : ""} ${it.submenu ? "has-submenu" : ""} ${openSub === i ? "open" : ""}`}
              role="menuitem"
              onMouseEnter={() => {
                if (it.submenu) setOpenSub(i);
                else setOpenSub(null);
              }}
              onClick={() => {
                if (it.submenu) {
                  setOpenSub((cur) => (cur === i ? null : i));
                  return;
                }
                it.onSelect?.();
                onClose();
              }}
            >
              <span className="ctx-item-label">{it.label}</span>
              {it.submenu && <span className="ctx-item-arrow" aria-hidden>›</span>}
            </button>
          ),
        )}
      </div>
      {submenuNode && (
        <div
          ref={submenuRef}
          className="ctx-submenu"
          role="menu"
          style={{
            left: subPos?.left ?? -9999,
            top: subPos?.top ?? -9999,
            visibility: subPos ? "visible" : "hidden",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {submenuNode}
        </div>
      )}
    </>
  );
}
