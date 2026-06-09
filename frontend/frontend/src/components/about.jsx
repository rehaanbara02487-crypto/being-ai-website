export default function About() {
  return (
    <section
      style={{
        minHeight: "100vh",
        padding: "120px 10%",
        color: "white",
        background: "transparent",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          fontSize: "4rem",
          marginBottom: "40px",
        }}
      >
        About Being AI
      </h2>

      <p
        style={{
          maxWidth: "900px",
          margin: "auto",
          textAlign: "center",
          fontSize: "1.3rem",
          lineHeight: 1.8,
          opacity: 0.85,
        }}
      >
        Being AI builds intelligent software, AI agents,
        automation systems and computer vision solutions.
        We help businesses transform ideas into scalable,
        production-ready products.
      </p>
    </section>
  );
}