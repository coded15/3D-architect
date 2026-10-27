"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { buildHouse, floorBase, LINTEL, type Element } from "@/lib/house3d";
import type { Palette } from "@/lib/palette";
import { ROOM_COLORS } from "@/lib/plan";
import type { HousePlan } from "@/lib/types";

type Props = {
  plan: HousePlan;
  stage: number;
  maxFloor: number;
  cutRoof: boolean;
  palettes: Record<string, Palette>;
  exterior: Palette | null;
  selectedRoomId: string | null;
  onRoomClick: (roomId: string | null) => void;
};

const BRICK = "#b5583f";
const CONCRETE = "#a3a3a0";
const PLASTER = "#efe9df";
const GLASS = "#9fd3ff";

export function House3D(props: Props) {
  const { plan } = props;
  const span = Math.max(plan.plot.width, plan.plot.depth);
  return (
    <Canvas camera={{ position: [span * 0.9, span * 0.8, span * 1.1], fov: 45, near: 0.5, far: span * 20 }} dpr={[1, 2]}>
      <color attach="background" args={["#eef2f6"]} />
      <hemisphereLight args={["#ffffff", "#b7a98f", 1.1]} />
      <directionalLight position={[span, span * 1.5, span * 0.6]} intensity={1.6} />
      <directionalLight position={[-span, span, -span]} intensity={0.4} />
      <Scene {...props} />
      <OrbitControls makeDefault target={[0, plan.floorHeight / 2, 0]} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}

function Scene({ plan, stage, maxFloor, cutRoof, palettes, exterior, selectedRoomId, onRoomClick }: Props) {
  const elements = useMemo(() => buildHouse(plan), [plan]);
  const topFloor = Math.min(maxFloor, plan.floors - 1);

  const visible = elements.flatMap((el) => {
    if (el.floor > maxFloor) return [];
    const show = isVisible(el, stage) && !(cutRoof && el.kind === "slab" && el.floor === topFloor);
    if (!show) return [];
    if (el.kind === "wall" && stage === 3) {
      // Brickwork stage: walls only reach lintel level.
      const limit = floorBase(plan, el.floor) + LINTEL;
      const bottom = el.position[1] - el.size[1] / 2;
      const top = Math.min(el.position[1] + el.size[1] / 2, limit);
      if (top <= bottom + 0.01) return [];
      return [{ ...el, position: [el.position[0], (bottom + top) / 2, el.position[2]] as Element["position"], size: [el.size[0], top - bottom, el.size[2]] as Element["size"] }];
    }
    return [el];
  });

  const click = (roomId: string | null) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onRoomClick(roomId);
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onClick={click(null)}>
        <planeGeometry args={[plan.plot.width * 4, plan.plot.depth * 4]} />
        <meshStandardMaterial color="#cdd8c0" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[plan.plot.width, plan.plot.depth]} />
        <meshStandardMaterial color="#d8ccb2" />
      </mesh>
      {visible.map((el) => (
        <mesh key={el.key} position={el.position} onClick={el.roomId && clickable(el) ? click(el.roomId) : undefined}>
          <boxGeometry args={el.size} />
          <meshStandardMaterial {...material(el, stage, palettes, exterior, selectedRoomId)} />
        </mesh>
      ))}
    </group>
  );
}

function clickable(el: Element) {
  return el.kind === "floorFinish" || el.kind === "plinth" || el.kind === "marking" || el.kind === "wall";
}

function isVisible(el: Element, stage: number) {
  switch (el.kind) {
    case "marking":
      return stage === 0;
    case "plinth":
      return stage >= 1;
    case "column":
      return stage >= 2 && stage <= 4;
    case "wall":
      return stage >= 3;
    case "slab":
      return stage >= 4;
    case "floorFinish":
    case "glass":
      return stage >= 6;
  }
}

function material(
  el: Element,
  stage: number,
  palettes: Record<string, Palette>,
  exterior: Palette | null,
  selectedRoomId: string | null,
) {
  const selected = el.roomId !== null && el.roomId === selectedRoomId;
  const emissive = selected ? "#ffb347" : "#000000";
  const emissiveIntensity = selected ? 0.25 : 0;
  const palette = el.roomId ? palettes[el.roomId] : undefined;

  switch (el.kind) {
    case "marking":
      return { color: roomColor(el), transparent: true, opacity: 0.7, emissive, emissiveIntensity };
    case "plinth":
    case "column":
    case "slab":
      return { color: CONCRETE, roughness: 0.95, emissive, emissiveIntensity };
    case "glass":
      return { color: GLASS, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 };
    case "floorFinish":
      return { color: palette?.floor ?? "#d6c7aa", roughness: 0.6, emissive, emissiveIntensity };
    case "wall": {
      if (stage < 5) return { color: BRICK, roughness: 1, emissive, emissiveIntensity };
      const color = el.exterior ? (exterior?.wall ?? PLASTER) : (palette?.wall ?? PLASTER);
      return { color, roughness: 0.85, emissive, emissiveIntensity };
    }
  }
}

function roomColor(el: Element) {
  return el.roomId ? "#ffffff" : ROOM_COLORS.other;
}
