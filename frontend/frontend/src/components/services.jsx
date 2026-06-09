export default function Services() {
  const services = [
    {
      icon: "🤖",
      title: "AI Agents",
      desc: "Autonomous AI agents that perform research, customer support and business workflows."
    },
    {
      icon: "💻",
      title: "Custom Software",
      desc: "Modern SaaS platforms, dashboards and enterprise software."
    },
    {
      icon: "⚡",
      title: "Automation",
      desc: "Automate repetitive tasks and connect systems together."
    },
    {
      icon: "👁️",
      title: "Computer Vision",
      desc: "OCR, image analysis, object detection and AI-powered vision."
    }
  ];

  return (
    <section
      id="services"
      style={{
        minHeight: "100vh",
        padding: "140px 10%",
        position: "relative",
        zIndex: 20,
      }}
    >
      <h2
        style={{
          textAlign: "center",
          color: "white",
          fontSize: "4rem",
          marginBottom: "20px",
        }}
      >
        What We Build
      </h2>

      <p
        style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.7)",
          maxWidth: "700px",
          margin: "0 auto 80px",
          fontSize: "1.2rem",
        }}
      >
        Intelligent systems that automate work, save time and scale businesses.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: "40px",
        }}
      >
        {services.map((service) => (
          <div
            key={service.title}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "30px",
              padding: "40px",
              backdropFilter: "blur(15px)",
              transition: "0.3s",
              color: "white",
            }}
          >
            <div
              style={{
                fontSize: "3rem",
                marginBottom: "20px",
              }}
            >
              {service.icon}
            </div>

            <h3
              style={{
                color: "#00ffff",
                fontSize: "2rem",
                marginBottom: "20px",
              }}
            >
              {service.title}
            </h3>

            <p
              style={{
                lineHeight: "1.8",
                opacity: 0.85,
                fontSize: "1.15rem",
              }}
            >
              {service.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}