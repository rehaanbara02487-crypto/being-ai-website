export default function Projects() {
  return (
    <section
      style={{
        minHeight: "100vh",
        background: "transparent",
        color: "white",
        padding: "120px 10%",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          fontSize: "4rem",
          marginBottom: "70px",
        }}
      >
        Featured Projects
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: "30px",
        }}
      >
        <div
          style={{
            padding: "40px",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(10px)",
          }}
        >
          <h3>AI Resume Builder</h3>
          <p>Create ATS-friendly resumes using AI.</p>
        </div>

        <div
          style={{
            padding: "40px",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(10px)",
          }}
        >
          <h3>Vision OCR Platform</h3>
          <p>Extract information from images and documents.</p>
        </div>

        <div
          style={{
            padding: "40px",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(10px)",
          }}
        >
          <h3>Business Automation Suite</h3>
          <p>Automate repetitive workflows and save time.</p>
        </div>
      </div>
    </section>
  );
}