import { useRef, useState } from "react";
import { extractTextFromFile } from "../utils/fileText";
import sampleText from "../data/sample_text.txt?raw";

// Shown on first load (and whenever reopened via the header button): choose
// how to start the document — upload a .txt or .pdf file, load the built-in
// sample text, or start from an empty page. `onCancel` closes the modal
// without changing the document; used when reopening mid-session so it
// doesn't force a destructive replace.
export default function StartupModal({ onSelectText, onStartEmpty, onCancel }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("That file doesn't contain any text.");
      onSelectText(text);
    } catch (err) {
      setError(err.message || "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        {onCancel && (
          <button
            className="modal-close"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <h2>Start a document</h2>
        <p className="hint">
          Upload a file, load the sample text, or start with a blank page.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => fileInputRef.current.click()}
          >
            {busy ? "Reading file…" : "Upload a file (.txt or .pdf)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,text/plain,application/pdf"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            className="btn"
            disabled={busy}
            onClick={() => onSelectText(sampleText)}
          >
            Use sample text
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={onStartEmpty}>
            Start with an empty page
          </button>
        </div>
        {error && <p className="hint hint-error">{error}</p>}
      </div>
    </div>
  );
}
