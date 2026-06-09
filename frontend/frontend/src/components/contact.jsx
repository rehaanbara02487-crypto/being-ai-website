export default function Contact() {
  return (
    <section
      id="contact"
      style={{
        minHeight: "80vh",
        padding: "120px 10%",
        color: "white",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontSize: "4rem",
          marginBottom: "20px",
        }}
      >
        Contact Us
      </h2>

      <p
        style={{
          opacity: 0.8,
          marginBottom: "50px",
        }}
      >
        Let's build something amazing together.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "30px",
          flexWrap: "wrap",
        }}
      >
        <button
          style={{
            background: "#00ffff",
            color: "black",
            border: "none",
            padding: "18px 40px",
            borderRadius: "50px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          team@beingai.space
        </button>

        <button
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.2)",
            padding: "18px 40px",
            borderRadius: "50px",
            cursor: "pointer",
          }}
        >
          Book A Call
        </button>
      </div>
    </section>
  );
}