import { Composition, Easing, interpolate, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";

function MetalOrbit({ closing = false }: { closing?: boolean }) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const reveal = interpolate(frame, [0, fps * 1.8], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const settle = closing ? interpolate(frame, [0, durationInFrames], [1, 0.25]) : 1;
  return <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 13], fov: 40 }} gl={{ antialias: true }} style={{ background: "#0c0c0e" }}>
    <ambientLight intensity={1.4} />
    <directionalLight position={[3, 5, 6]} intensity={5} color="#ffffff" />
    <directionalLight position={[-4, -2, 3]} intensity={2.8} color="#a9b1c6" />
    <pointLight position={[4, 0, 2]} intensity={65} />
    <group position={[2.65, 0, 0]} rotation={[0.28 + t * 0.045 * settle, -0.45 + t * 0.12 * settle, 0.15]} scale={0.78 + reveal * 0.22}>
      {[0, 1, 2].map(i => <mesh key={i} rotation={[i * 0.78 + 0.18, i * 0.61 + t * 0.05, i * 0.32]}>
        <torusGeometry args={[2.05 + i * 0.36, 0.055 + i * 0.012, 12, 112]} />
        <meshPhysicalMaterial color="#c7cbd4" metalness={0.86} roughness={0.22} clearcoat={0.8} />
      </mesh>)}
      {Array.from({ length: 16 }, (_, i) => {
        const a = i / 16 * Math.PI * 2;
        const r = 2.2 + (1 - reveal) * (0.5 + (i % 3) * 0.2);
        return <mesh key={i} position={[Math.cos(a) * r, Math.sin(a) * r, Math.sin(a * 2 + t * 0.25) * 0.35]} rotation={[a * 0.3, a, a + Math.PI / 4]} scale={0.65 + reveal * 0.35}>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshPhysicalMaterial color={i % 4 === 0 ? "#ffffff" : "#7d8598"} metalness={0.7} roughness={0.18} clearcoat={1} />
        </mesh>;
      })}
      <mesh rotation={[Math.PI / 2.5, 0.2, t * 0.1]}>
        <torusGeometry args={[1.25, 0.27, 24, 96]} />
        <meshPhysicalMaterial color="#e3e5ed" metalness={0.78} roughness={0.18} clearcoat={1} />
      </mesh>
    </group>
  </ThreeCanvas>;
}

function Root() {
  return <>
    <Composition id="MetalIntro" component={MetalOrbit} durationInFrames={120} fps={30} width={1920} height={1080} />
    <Composition id="MetalOutro" component={MetalOrbit} durationInFrames={180} fps={30} width={1920} height={1080} defaultProps={{ closing: true }} />
  </>;
}
registerRoot(Root);
