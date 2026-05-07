import { useEffect, useMemo, useState } from "react";
import {
  getGitApi,
  type GitCommitDetail,
  type GitLogEntry,
} from "../lib/git-api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { layoutGraph } from "../lib/git-graph";
import { CommitRow } from "./CommitRow";
import { GraphCell } from "./GraphCell";
import { DiffView } from "./DiffView";
import { CloseIcon, RefreshIcon, SpinnerIcon } from "./icons";

interface Props {
  cwd: string;
  onClose: () => void;
}

const PAGE = 200;
const ROW_HEIGHT = 44;
const LANE_WIDTH = 14;

export function HistoryModal({ cwd, onClose }: Props) {
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<"side" | "unified">("side");

  useEscapeKey(onClose);

  const loadPage = async (skip: number) => {
    const api = getGitApi();
    if (!api) {
      setLoadError("git api unavailable");
      setLoading(false);
      return;
    }
    try {
      const list = await api.log(cwd, { limit: PAGE, skip, all: true });
      if (skip === 0) setCommits(list);
      else setCommits((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCommits([]);
    setSelectedSha(null);
    setDetail(null);
    setLoading(true);
    void loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  useEffect(() => {
    if (!selectedSha) {
      setDetail(null);
      setSelectedFile(null);
      return;
    }
    let active = true;
    const api = getGitApi();
    if (!api) return;
    setDetailError(null);
    api
      .show(cwd, selectedSha)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setSelectedFile(d.files[0]?.path ?? null);
      })
      .catch((e) => {
        if (active) setDetailError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [cwd, selectedSha]);

  useEffect(() => {
    if (!selectedSha || !selectedFile) {
      setDiffText("");
      return;
    }
    let active = true;
    const api = getGitApi();
    if (!api) return;
    setDiffLoading(true);
    setDiffError(null);
    setDiffText("");
    api
      .diffCommit(cwd, selectedSha, selectedFile, diffView === "side" ? 1_000_000 : undefined)
      .then((res) => {
        if (!active) return;
        setDiffText(res.text);
      })
      .catch((e) => {
        if (active) setDiffError((e as Error).message);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cwd, selectedSha, selectedFile, diffView]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return commits;
    return commits.filter(
      (c) =>
        c.subject.toLowerCase().includes(f) ||
        c.author.toLowerCase().includes(f) ||
        c.shortSha.toLowerCase().includes(f),
    );
  }, [commits, filter]);

  const layout = useMemo(() => layoutGraph(filtered), [filtered]);
  const totalLanes = Math.max(1, layout.maxLane + 1);

  return (
    <div className="git-diff-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="git-diff-modal git-history-modal"
        role="dialog"
        aria-label="history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge staged">history</span>
            <span className="git-diff-modal-path">
              {commits.length} commit{commits.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="git-diff-modal-actions">
            <input
              type="text"
              className="git-branches-search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…"
              spellCheck={false}
            />
            <button
              className="ghost-btn git-icon-btn"
              onClick={() => {
                setLoading(true);
                void loadPage(0);
              }}
              title="refresh"
              disabled={loading}
            >
              {loading ? <SpinnerIcon /> : <RefreshIcon />}
            </button>
            <button
              type="button"
              className="winctl-btn"
              onClick={onClose}
              aria-label="close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="git-history-body">
          <div className="git-history-list">
            {loadError && <div className="git-diff-error">{loadError}</div>}
            {loading && commits.length === 0 && (
              <div className="git-diff-loading">loading…</div>
            )}
            {filtered.length === 0 && !loading && !loadError && (
              <div className="git-diff-empty">no commits</div>
            )}
            {layout.rows.map((row) => (
              <CommitRow
                key={row.commit.sha}
                commit={row.commit}
                selected={selectedSha === row.commit.sha}
                onClick={() => setSelectedSha(row.commit.sha)}
                graph={
                  <GraphCell
                    row={row}
                    rowHeight={ROW_HEIGHT}
                    laneWidth={LANE_WIDTH}
                    totalLanes={totalLanes}
                  />
                }
              />
            ))}
            {hasMore && filtered.length > 0 && (
              <button
                className="git-btn"
                style={{ alignSelf: "center", marginTop: 8 }}
                onClick={() => {
                  setLoading(true);
                  void loadPage(commits.length);
                }}
                disabled={loading}
              >
                {loading ? <SpinnerIcon /> : null}
                <span>{loading ? "loading…" : "load more"}</span>
              </button>
            )}
          </div>

          <div className="git-history-detail">
            {!selectedSha && (
              <div className="git-diff-empty">select a commit to see details</div>
            )}
            {selectedSha && detailError && (
              <div className="git-diff-error">{detailError}</div>
            )}
            {selectedSha && !detail && !detailError && (
              <div className="git-diff-loading">loading commit…</div>
            )}
            {detail && (
              <>
                <div className="git-history-detail-h">
                  <div className="git-history-detail-subject">{detail.subject}</div>
                  <div className="git-history-detail-meta">
                    <span className="git-commit-sha">{detail.sha.slice(0, 10)}</span>
                    <span className="git-commit-author">
                      {detail.author} &lt;{detail.authorEmail}&gt;
                    </span>
                    <span className="git-commit-date">
                      {new Date(detail.date * 1000).toLocaleString()}
                    </span>
                  </div>
                  {detail.body && (
                    <pre className="git-history-detail-body">{detail.body}</pre>
                  )}
                </div>
                <div className="git-history-files">
                  <div className="git-history-files-h">
                    {detail.files.length} file{detail.files.length === 1 ? "" : "s"}
                  </div>
                  {detail.files.map((f) => (
                    <button
                      key={f.path}
                      className={`git-history-file ${selectedFile === f.path ? "selected" : ""}`}
                      onClick={() => setSelectedFile(f.path)}
                      title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                    >
                      <span className={`git-history-file-status ${f.status}`}>
                        {f.status}
                      </span>
                      <span className="git-history-file-path">{f.path}</span>
                    </button>
                  ))}
                </div>
                {selectedFile && (
                  <div className="git-history-diff">
                    <div className="git-history-diff-h">
                      <span className="git-diff-modal-path">{selectedFile}</span>
                      <button
                        className="git-btn"
                        onClick={() =>
                          setDiffView(diffView === "side" ? "unified" : "side")
                        }
                      >
                        {diffView === "side" ? "unified" : "side-by-side"}
                      </button>
                    </div>
                    <div className="git-history-diff-body">
                      <DiffView
                        text={diffText}
                        view={diffView}
                        loading={diffLoading}
                        error={diffError}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
