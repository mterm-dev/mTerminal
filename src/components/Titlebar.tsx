import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  title: string;
}

export function Titlebar({ title }: Props) {
  const win = getCurrentWindow();
  return (
    <div className="term-titlebar" data-tauri-drag-region>
      <div className="term-traffic">
        <button
          className="close"
          aria-label="close"
          onClick={() => win.close()}
        />
        <button
          className="min"
          aria-label="minimize"
          onClick={() => win.minimize()}
        />
        <button
          className="max"
          aria-label="maximize"
          onClick={() => win.toggleMaximize()}
        />
      </div>
      <div className="term-title" data-tauri-drag-region>
        {title}
      </div>
      <div style={{ width: 52 }} />
    </div>
  );
}
