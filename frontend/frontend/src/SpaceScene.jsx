import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { useRef } from "react";

function Planet() {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.002;
    }
  });

  return (
    <group position={[4, 0, -8]}>
      <mesh ref={ref}>
        <sphereGeometry args={[1.8, 64, 64]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#8b5cf6"
          emissiveIntensity={0.4}
        />
      </mesh>

      <mesh rotation={[1.2, 0, 0]}>
        <torusGeometry args={[2.8, 0.08, 16, 200]} />
        <meshBasicMaterial color="#d1fae5" />
      </mesh>
    </group>
  );
}

function Moon() {
  const ref = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (ref.current) {
      ref.current.position.x = 6 + Math.cos(t * 0.3) * 2;
      ref.current.position.y = Math.sin(t * 0.3) * 1;
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.4, 32, 32]} />
      <meshStandardMaterial color="#ffffff" />
    </mesh>
  );
}

function BlackHole() {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.z += 0.01;
    }
  });

  return (
    <mesh
      ref={ref}
      position={[-7, 3, -12]}
      rotation={[1.2, 0, 0]}
    >
      <torusGeometry args={[1.5, 0.35, 32, 200]} />
      <meshBasicMaterial color="#f59e0b" />
    </mesh>
  );
}

function SmallPlanet() {
  return (
    <mesh position={[-5, -3, -10]}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#ef4444"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

function BluePlanet() {
  return (
    <mesh position={[7, 2, -15]}>
      <sphereGeometry args={[0.7, 32, 32]} />
      <meshStandardMaterial
        color="#60a5fa"
        emissive="#60a5fa"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

export default function SpaceScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -10,
        pointerEvents: "none",
      }}
    >
      <color attach="background" args={["#000814"]} />

      <fog attach="fog" args={["#000814", 20, 60]} />

      <ambientLight intensity={1.5} />

      <pointLight
        position={[10, 10, 10]}
        intensity={20}
        color="#00ffff"
      />

      <pointLight
        position={[-10, 5, -5]}
        intensity={10}
        color="#f59e0b"
      />

      <Stars
        radius={500}
        depth={300}
        count={50000}
        factor={8}
        fade
      />

      <Planet />
      <Moon />
      <BlackHole />
      <SmallPlanet />
      <BluePlanet />
    </Canvas>
  );
}