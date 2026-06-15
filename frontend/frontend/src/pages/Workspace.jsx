import { useState, useEffect } from "react";

export default function Workspace() {

  const [prompt, setPrompt] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome to BEING AI. Describe your project and I'll help you build it.",
    },
  ]);

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [projectFiles, setProjectFiles] = useState([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/projects"
      );

      const data = await response.json();

      setProjects(data.projects);
    } catch (err) {
      console.error(err);
    }
  };

const sendPrompt = async () => {
  if (!prompt.trim()) return;

  const userPrompt = prompt;

  setMessages((prev) => [
    ...prev,
    {
      role: "user",
      content: userPrompt,
    },
  ]);

  setPrompt("");

  try {
    const response = await fetch(
      "http://127.0.0.1:8000/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: userPrompt,
        }),
      }
    );

    const data = await response.json();

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: JSON.stringify(data, null, 2),
      },
    ]);
  } catch (error) {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Backend connection failed.",
      },
    ]);

    console.error(error);
  }
};
const openProject = async (projectName) => {
  setSelectedProject(projectName);

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/projects/${projectName}`
    );

    const data = await response.json();

    setProjectFiles(data.files);
  } catch (err) {
    console.error(err);
  }
};
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#050816",
        color: "white",
        overflow: "hidden",
      }}
    >
      {/* SIDEBAR */}
      <div
        style={{
          width: "280px",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2
          style={{
            color: "#00ffff",
            marginBottom: "20px",
          }}
        >
          BEING AI
        </h2>

        <button
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: "#00ffff",
            color: "#000",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          + New Project
        </button>

        <div
          style={{
            marginTop: "40px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            opacity: 0.9,
          }}
        >
<div>
  <p>📁 Projects</p>

{projects.map((project) => (
  <div
    key={project}
    onClick={() => openProject(project)}
    style={{
      marginLeft: "20px",
      marginTop: "8px",
      cursor: "pointer",
      opacity: 0.8,
    }}
  >
    {project}
  </div>
))}
</div>
          <p>🚀 Deployments</p>
          <p>📄 Files</p>
          <p>⚙️ Settings</p>
        </div>

        <div
          style={{
            marginTop: "auto",
            opacity: 0.6,
            fontSize: "14px",
          }}
        >
          AI Engineer v1
        </div>
      </div>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <h1
            style={{
              margin: 0,
              color: "#00ffff",
            }}
          >
            AI Engineer
          </h1>

          <p
            style={{
              opacity: 0.7,
              marginTop: "8px",
            }}
          >
            Build entire applications using prompts.
          </p>
        </div>

{/* CHAT AREA */}
<div
  style={{
    flex: 1,
    overflowY: "auto",
    padding: "20px",
  }}
>

  {selectedProject && (
    <div
      style={{
        marginBottom: "20px",
        padding: "15px",
        border: "1px solid #333",
        borderRadius: "10px",
        background: "#111827",
      }}
    >
      <h3>{selectedProject}</h3>
      {projectFiles.map((file) => (
  <div
    key={file}
    style={{
      marginTop: "8px",
      cursor: "pointer",
      color: "#00ffff",
    }}
  >
    📄 {file}
  </div>
))}

    </div>
  )}

  {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                marginBottom: "20px",
                display: "flex",
                justifyContent:
                  msg.role === "user"
                    ? "flex-end"
                    : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "15px",
                  borderRadius: "12px",
                  background:
                    msg.role === "user"
                      ? "#00ffff"
                      : "#111827",
                  color:
                    msg.role === "user"
                      ? "#000"
                      : "#fff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div
          style={{
            padding: "20px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            gap: "10px",
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendPrompt();
              }
            }}
            placeholder="Describe what you want to build..."
            style={{
              flex: 1,
              padding: "15px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "#111827",
              color: "white",
              outline: "none",
            }}
          />

          <button
            onClick={sendPrompt}
            style={{
              padding: "15px 25px",
              borderRadius: "12px",
              border: "none",
              background: "#00ffff",
              color: "#000",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}