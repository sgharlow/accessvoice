interface BrowserViewProps {
  screenshot: string | null;
}

export default function BrowserView({ screenshot }: BrowserViewProps) {
  return (
    <div
      className="browser-view"
      role="img"
      aria-label={
        screenshot
          ? "Live browser view showing the current webpage"
          : "Browser view — no page loaded"
      }
    >
      {screenshot ? (
        <img
          src={`data:image/jpeg;base64,${screenshot}`}
          alt="Current webpage being browsed"
          className="browser-screenshot"
        />
      ) : (
        <div className="browser-placeholder">
          <div className="placeholder-icon" aria-hidden="true">
            &#127760;
          </div>
          <p>Start a session and ask me to browse a website</p>
          <p className="placeholder-hint">
            Try: "Search for apartments in Seattle on Zillow"
          </p>
        </div>
      )}
    </div>
  );
}
