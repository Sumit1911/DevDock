import React, { useState } from "react";

const WebsiteBuilder = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(null);
  const [error, setError] = useState("");

  const API_BASE_URL = "http://localhost:5000";

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setLoading(true);
    setError("");
    setWebsiteUrl(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Website generation failed");
      }

      // Use directUrl from backend
      setWebsiteUrl(data.directUrl);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>AI Website Generator</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your website..."
        rows={4}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <br />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate Website"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {websiteUrl && (
        <div style={{ marginTop: "2rem" }}>
          <div style={{display: "flex"}}>
            <h2>Your Website:</h2>
            <button onClick={() => window.open(websiteUrl, "_blank")}>Preview</button>
          </div>
          <iframe
            src={websiteUrl}
            title="Generated Website"
            style={{ width: "100%", height: "600px", border: "1px solid #ccc" }}
          />
        </div>
      )}
    </div>
  );
};

export default WebsiteBuilder;
