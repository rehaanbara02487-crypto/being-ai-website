import { useCallback, useEffect, useState } from "react";

import {
  commitGitChanges,
  createGitBranch,
  createGitSnapshot,
  getGitBranch,
  getGitDiff,
  getGitHistory,
  getGitSnapshots,
  getGitStatus,
  restoreGitRef,
  revertGitCommit,
  suggestGitCommitMessage,
  summarizeGitDiff,
  switchGitBranch,
} from "../lib/api";

const smallButton = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "999px",
  color: "white",
  cursor: "pointer",
  padding: "8px 12px",
};

export default function SourceControlPanel({ selectedProject, onWorkspaceChanged, compact = false }) {
  const [branchInfo, setBranchInfo] = useState({ branch: "", branches: [] });
  const [changes, setChanges] = useState([]);
  const [history, setHistory] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [diff, setDiff] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [message, setMessage] = useState("Select a project to use source control.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshGit = useCallback(async (projectName = selectedProject) => {
    if (!projectName) return;

    setLoading(true);
    setError("");

    try {
      const [branchData, statusData, historyData, snapshotData] = await Promise.all([
        getGitBranch(projectName),
        getGitStatus(projectName),
        getGitHistory(projectName),
        getGitSnapshots(projectName),
      ]);

      setBranchInfo(branchData);
      setChanges(statusData.changes || []);
      setHistory(historyData.commits || []);
      setSnapshots(snapshotData.snapshots || []);
      setMessage("Source control ready.");

      if (selectedPath) {
        const diffData = await getGitDiff(projectName, selectedPath);
        setDiff(diffData.diff || "");
      }
    } catch (gitError) {
      setError(gitError.message);
      setMessage("Unable to load source control.");
    } finally {
      setLoading(false);
    }
  }, [selectedPath, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      const timeoutId = window.setTimeout(() => {
        refreshGit(selectedProject);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [selectedProject, refreshGit]);

  async function selectChange(path) {
    if (!selectedProject) return;

    setSelectedPath(path);
    setError("");

    try {
      const diffData = await getGitDiff(selectedProject, path);
      setDiff(diffData.diff || "No diff available.");
    } catch (diffError) {
      setError(diffError.message);
    }
  }

  async function suggestCommitMessage() {
    if (!selectedProject) return;
    setLoading(true);
    setError("");
    try {
      const diffData = await getGitDiff(selectedProject, selectedPath || "");
      const result = await suggestGitCommitMessage(selectedProject, {
        diff: diffData.diff || diff,
        changes,
      });
      setCommitMessage(result.message || "");
      setMessage("Suggested commit message ready.");
    } catch (suggestError) {
      setError(suggestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function summarizeSelectedDiff() {
    if (!selectedProject) return;
    setLoading(true);
    setError("");
    try {
      const diffData = await getGitDiff(selectedProject, selectedPath || "");
      const result = await summarizeGitDiff(selectedProject, diffData.diff || diff);
      setMessage(result.summary || "Diff summarized.");
    } catch (summaryError) {
      setError(summaryError.message);
    } finally {
      setLoading(false);
    }
  }

  async function commitChanges() {
    if (!selectedProject || !commitMessage.trim()) return;

    try {
      const result = await commitGitChanges(selectedProject, commitMessage.trim());
      setCommitMessage("");
      setMessage(`Committed ${result.hash.slice(0, 7)}${result.snapshot ? ` and saved ${result.snapshot.name}` : ""}.`);
      await refreshGit();
    } catch (commitError) {
      setError(commitError.message);
    }
  }

  async function createBranch() {
    if (!selectedProject || !newBranch.trim()) return;

    try {
      await createGitBranch(selectedProject, newBranch.trim(), true);
      setNewBranch("");
      setMessage("Branch created and checked out.");
      await refreshGit();
      onWorkspaceChanged?.();
    } catch (branchError) {
      setError(branchError.message);
    }
  }

  async function switchBranch(branch) {
    if (!selectedProject || !branch) return;

    try {
      await switchGitBranch(selectedProject, branch);
      setMessage(`Switched to ${branch}.`);
      await refreshGit();
      onWorkspaceChanged?.();
    } catch (switchError) {
      setError(switchError.message);
    }
  }

  async function snapshot() {
    if (!selectedProject) return;

    try {
      const result = await createGitSnapshot(selectedProject);
      setMessage(`Snapshot ${result.name} created.`);
      await refreshGit();
    } catch (snapshotError) {
      setError(snapshotError.message);
    }
  }

  async function restore(ref, path) {
    if (!selectedProject || !ref) return;
    if (!window.confirm(`Restore ${path || "workspace"} from ${ref}?`)) return;

    try {
      await restoreGitRef(selectedProject, ref, path);
      setMessage(`Restored ${path || "workspace"} from ${ref}.`);
      await refreshGit();
      onWorkspaceChanged?.();
    } catch (restoreError) {
      setError(restoreError.message);
    }
  }

  async function revertCommit(commitHash) {
    if (!selectedProject || !commitHash) return;
    if (!window.confirm(`Revert commit ${commitHash.slice(0, 7)}?`)) return;

    try {
      await revertGitCommit(selectedProject, commitHash);
      setMessage(`Reverted ${commitHash.slice(0, 7)}.`);
      await refreshGit();
      onWorkspaceChanged?.();
    } catch (revertError) {
      setError(revertError.message);
    }
  }

  return (
    <aside
      style={{
        background: compact ? "transparent" : "rgba(255,255,255,0.05)",
        border: compact ? "none" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: compact ? 0 : "22px",
        color: "white",
        display: "flex",
        flex: "1 1 0",
        flexDirection: "column",
        height: compact ? "100%" : undefined,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: compact ? "10px 12px" : "14px",
        }}
      >
        <h3
          style={{
            color: "#00ffff",
            fontSize: compact ? "0.72rem" : "1rem",
            letterSpacing: compact ? "0.06em" : undefined,
            margin: "0 0 8px",
            textTransform: compact ? "uppercase" : undefined,
          }}
        >
          Source Control
        </h3>
        <div style={{ color: error ? "#ff8585" : "rgba(255,255,255,0.62)", fontSize: "0.86rem" }}>
          {error || message}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: "12px", overflow: "auto", padding: "14px" }}>
        <section>
          <strong>Branch</strong>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <select
              disabled={!selectedProject}
              onChange={(event) => switchBranch(event.target.value)}
              value={branchInfo.branch}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "10px",
                color: "white",
                flex: 1,
                padding: "8px",
              }}
            >
              <option value={branchInfo.branch}>{branchInfo.branch || "main"}</option>
              {branchInfo.branches
                .filter((branch) => branch !== branchInfo.branch)
                .map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
            </select>
            <button disabled={loading} onClick={() => refreshGit()} style={smallButton} type="button">
              Refresh
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <input
              disabled={!selectedProject}
              onChange={(event) => setNewBranch(event.target.value)}
              placeholder="new-branch"
              value={newBranch}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "10px",
                color: "white",
                flex: 1,
                padding: "8px",
              }}
            />
            <button disabled={!newBranch.trim()} onClick={createBranch} style={smallButton} type="button">
              Create
            </button>
          </div>
        </section>

        <section>
          <strong>Changes ({changes.length})</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {changes.length ? (
              changes.map((change) => (
                <button
                  key={`${change.status}-${change.path}`}
                  onClick={() => selectChange(change.path)}
                  style={{
                    ...smallButton,
                    borderRadius: "10px",
                    textAlign: "left",
                    width: "100%",
                    background:
                      change.path === selectedPath
                        ? "rgba(0,255,255,0.18)"
                        : "rgba(255,255,255,0.06)",
                  }}
                  type="button"
                >
                  {change.type}: {change.path}
                </button>
              ))
            ) : (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.86rem" }}>No changes.</div>
            )}
          </div>
        </section>

        <section>
          <strong>Diff</strong>
          <pre
            style={{
              background: "rgba(0,0,0,0.42)",
              borderRadius: "10px",
              color: "rgba(255,255,255,0.82)",
              fontSize: "0.75rem",
              maxHeight: "180px",
              overflow: "auto",
              padding: "10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {diff || "Select a changed file to preview its diff."}
          </pre>
        </section>

        <section>
          <strong>Commit</strong>
          <textarea
            disabled={!selectedProject}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Commit message"
            rows={3}
            value={commitMessage}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "10px",
              color: "white",
              marginTop: "8px",
              padding: "8px",
              width: "100%",
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              disabled={!changes.length || loading}
              onClick={suggestCommitMessage}
              style={{ ...smallButton, flex: 1 }}
              type="button"
            >
              AI Commit Message
            </button>
            <button
              disabled={!diff || loading}
              onClick={summarizeSelectedDiff}
              style={{ ...smallButton, flex: 1 }}
              type="button"
            >
              Summarize Diff
            </button>
          </div>
          <button
            disabled={!commitMessage.trim() || !changes.length}
            onClick={commitChanges}
            style={{ ...smallButton, marginTop: "8px", width: "100%" }}
            type="button"
          >
            Commit Changes
          </button>
        </section>

        <section>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <strong>History</strong>
            <button disabled={!history.length} onClick={snapshot} style={smallButton} type="button">
              Snapshot
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
            {history.map((commit) => (
              <div
                key={commit.hash}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "10px",
                }}
              >
                <div style={{ color: "#00ffff", fontFamily: "monospace" }}>{commit.short_hash}</div>
                <div>{commit.message}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>{commit.date}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={() => restore(commit.hash)} style={smallButton} type="button">
                    Restore
                  </button>
                  <button onClick={() => revertCommit(commit.hash)} style={smallButton} type="button">
                    Revert
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <strong>Snapshots</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {snapshots.length ? (
              snapshots.map((snapshotItem) => (
                <button
                  key={snapshotItem.name}
                  onClick={() => restore(snapshotItem.name)}
                  style={{ ...smallButton, borderRadius: "10px", textAlign: "left" }}
                  type="button"
                >
                  Restore {snapshotItem.name}
                </button>
              ))
            ) : (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.86rem" }}>
                No snapshots yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
