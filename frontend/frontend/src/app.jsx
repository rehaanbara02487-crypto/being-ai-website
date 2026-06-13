import { useEffect, useState } from "react";

import Contact from "./components/contact";
import Services from "./components/services";
import Projects from "./components/projects";
import SpaceScene from "./SpaceScene";
import About from "./components/about";
import Footer from "./components/footer";
import Workspace from "./components/Workspace";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigateToWorkspace = () => {
    window.history.pushState({}, "", "/workspace");
    setCurrentPath("/workspace");
  };

  const closeWorkspace = () => {
    window.history.pushState({}, "", "/");
    setCurrentPath("/");
  };

  if (currentPath === "/workspace") {
    return <Workspace onClose={closeWorkspace} />;
  }

  return (
    <>
      {/* HERO SECTION */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <SpaceScene />

        {/* NAVBAR */}
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 60,
            right: 60,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "white",
            zIndex: 300,
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#00ffff",
              letterSpacing: "2px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            BEING AI
          </h2>

          <div
            style={{
              display: "flex",
              gap: "35px",
              fontSize: "1rem",
            }}
          >
            <span>Products</span>
            <span>Solutions</span>
            <span>Pricing</span>
            <span>Docs</span>
          </div>
        </div>

        {/* HERO */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            zIndex: 200,
            textAlign: "center",
            padding: "0 20px",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              color: "#00ffff",
              letterSpacing: "8px",
              fontSize: "14px",
              marginBottom: "20px",
            }}
          >
            NEXT GENERATION AI ENGINEERING
          </p>

          <h1
            style={{
              fontSize: "clamp(4rem, 8vw, 7rem)",
              margin: 0,
              fontWeight: 900,
              lineHeight: 1,
              textShadow: `
                0 0 10px rgba(255,255,255,0.7),
                0 0 25px rgba(255,255,255,0.4),
                0 0 40px rgba(0,255,255,0.2)
              `,
            }}
          >
            BEING AI
          </h1>

          <p
            style={{
              width: "700px",
              maxWidth: "90%",
              fontSize: "1.4rem",
              marginTop: "25px",
              lineHeight: 1.6,
              opacity: 0.9,
            }}
          >
            Turn ideas into production-ready software.
            <br />
            Build, deploy and scale intelligent systems.
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              marginTop: "40px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={navigateToWorkspace}
              style={{
                background: "#00ffff",
                color: "#000",
                border: "none",
                padding: "18px 40px",
                borderRadius: "50px",
                fontWeight: "bold",
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 0 25px rgba(0,255,255,0.4)",
              }}
            >
              Launch Workspace
            </button>

            <button
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "18px 40px",
                borderRadius: "50px",
                fontSize: "1rem",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              Watch Demo
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: "100px",
              marginTop: "70px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <div>
              <h2 style={{ color: "#00ffff", margin: 0 }}>100+</h2>
              <p>Projects Delivered</p>
            </div>

            <div>
              <h2 style={{ color: "#00ffff", margin: 0 }}>24/7</h2>
              <p>Automation</p>
            </div>

            <div>
              <h2 style={{ color: "#00ffff", margin: 0 }}>99.9%</h2>
              <p>Uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* SERVICES SECTION */}
      <Services />
      {/* PROJECTS SECTION */}
      <Projects />
      <About/>
      <Footer/>
      <Contact/>
    </>
  );
}