import { useState } from "react";
import type { VersionInfo } from "../types";

interface UpdateBannerProps {
  version: VersionInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ version, onDismiss }: UpdateBannerProps) {
  const [copied, setCopied] = useState(false);

  if (!version.hasUpdate) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(version.updateCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="update-banner">
      <div className="update-content">
        <span className="update-icon">&#8593;</span>
        <span className="update-text">
          Update available: <strong>v{version.current}</strong> &rarr;{" "}
          <strong>v{version.latest}</strong>
        </span>
        <button className="update-copy" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy update command"}
        </button>
        {version.updateUrl && (
          <a
            href={version.updateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="update-link"
          >
            View release
          </a>
        )}
      </div>
      <button className="update-dismiss" onClick={onDismiss}>
        &times;
      </button>
    </div>
  );
}
