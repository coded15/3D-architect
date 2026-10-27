"use client";

import { Bounds, Center, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

export function GlbViewer({ url }: { url: string }) {
  return (
    <Canvas camera={{ position: [2, 1.5, 2.5], fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#f5f5f4"]} />
      <hemisphereLight args={["#ffffff", "#999999", 1.2]} />
      <directionalLight position={[3, 5, 2]} intensity={1.5} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          <Center>
            <Model url={url} />
          </Center>
        </Bounds>
      </Suspense>
      <OrbitControls makeDefault />
    </Canvas>
  );
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}
