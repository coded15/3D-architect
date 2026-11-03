"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { PerspectiveCamera } from "three";
import { furnitureParts, type FurnitureItem, type Part } from "@/lib/furniture";
import { buildHouse, floorBase, LINTEL, wallObstacles, type Element, type Obstacle } from "@/lib/house3d";
import type { Palette } from "@/lib/palette";
import { ROOM_COLORS } from "@/lib/plan";
import { buildTour, type TourPoint } from "@/lib/tour";
import type { HousePlan } from "@/lib/types";

export type ViewMode = "orbit" | "walk" | "tour";

type Props = {
  plan: HousePlan;
  stage: number;
  maxFloor: number;
  cutRoof: boolean;
  palettes: Record<string, Palette>;
  exterior: Palette | null;
  selectedRoomId: string | null;
  onRoomClick: (roomId: string | null) => void;
  furniture: FurnitureItem[] | null;
  showFurniture: boolean;
  mode: ViewMode;
  // Changing this restarts the tour.
  tourKey: number;
  onTourEnd: () => void;
  // Called when the tour cuts straight to a room it can't walk to (used for a fade).
  onTourCut: () => void;
  onLocation: (roomId: string | null) => void;
};

const BRICK = "#b5583f";
const CONCRETE = "#a3a3a0";
const PLASTER = "#efe9df";
const GLASS = "#9fd3ff";
const WOOD = "#8b5a2b";
const EYE = 5.3;
const FINISHED = 6;

export function House3D(props: Props) {
  const { plan, mode } = props;
  const span = Math.max(plan.plot.width, plan.plot.depth);
  const elements = useMemo(() => buildHouse(plan), [plan]);
  const parts = useMemo(() => {
    if (!props.furniture) return [];
    return props.furniture.flatMap((item) => {
      const room = plan.rooms.find((r) => r.id === item.roomId);
      return room ? furnitureParts(item, room, plan, floorBase(plan, room.floor)) : [];
    });
  }, [plan, props.furniture]);
  const showParts = props.showFurniture && (mode !== "orbit" || props.stage >= FINISHED);
  const obstacles = useMemo(() => {
    const walls = wallObstacles(plan, elements, 0);
    // Furniture you'd bump into; flat things like rugs are skipped.
    const furniture = showParts
      ? parts
          .filter((p) => p.size[1] > 0.3 && p.position[1] - p.size[1] / 2 < floorBase(plan, 0) + 5)
          .map((p) => ({
            minX: p.position[0] - p.size[0] / 2,
            maxX: p.position[0] + p.size[0] / 2,
            minZ: p.position[2] - p.size[2] / 2,
            maxZ: p.position[2] + p.size[2] / 2,
          }))
      : [];
    return [...walls, ...furniture];
  }, [plan, elements, parts, showParts]);

  return (
    <Canvas camera={{ position: orbitPosition(span), fov: 45, near: 0.5, far: span * 20 }} dpr={[1, 2]}>
      <color attach="background" args={[mode === "orbit" ? "#eef2f6" : "#cfe3f3"]} />
      <hemisphereLight args={["#ffffff", "#b7a98f", mode === "orbit" ? 1.1 : 1.35]} />
      <directionalLight position={[span, span * 1.5, span * 0.6]} intensity={1.6} />
      <directionalLight position={[-span, span, -span]} intensity={0.4} />
      {mode !== "orbit" && <ambientLight intensity={0.35} />}
      <Scene {...props} elements={elements} parts={showParts ? parts : []} />
      {mode === "orbit" && <OrbitRig span={span} floorHeight={plan.floorHeight} />}
      {mode === "walk" && <WalkRig plan={plan} obstacles={obstacles} onLocation={props.onLocation} />}
      {mode === "tour" && <TourRig key={props.tourKey} plan={plan} onEnd={props.onTourEnd} onCut={props.onTourCut} onLocation={props.onLocation} />}
    </Canvas>
  );
}

function orbitPosition(span: number): [number, number, number] {
  return [span * 0.9, span * 0.8, span * 1.1];
}

function OrbitRig({ span, floorHeight }: { span: number; floorHeight: number }) {
  const get = useThree((s) => s.get);
  // Coming back from walking: restore the overview camera.
  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.fov = 45;
    camera.near = 0.5;
    camera.rotation.order = "XYZ";
    camera.position.set(...orbitPosition(span));
    camera.updateProjectionMatrix();
  }, [get, span]);
  return <OrbitControls makeDefault target={[0, floorHeight / 2, 0]} maxPolarAngle={Math.PI / 2.05} />;
}

function useEyeCamera(fov = 70) {
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.fov = fov;
    camera.near = 0.1;
    camera.rotation.order = "YXZ";
    camera.updateProjectionMatrix();
  }, [get, fov]);
  return useThree((s) => s.camera);
}

function useLocationReporter(plan: HousePlan, onLocation: (roomId: string | null) => void) {
  const last = useRef<string | null | undefined>(undefined);
  return (x: number, z: number) => {
    const px = x + plan.plot.width / 2;
    const py = z + plan.plot.depth / 2;
    const room = plan.rooms.find((r) => r.floor === 0 && px > r.x && px < r.x + r.width && py > r.y && py < r.y + r.depth);
    const id = room?.id ?? null;
    if (id !== last.current) {
      last.current = id;
      onLocation(id);
    }
  };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTowards = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function toThree(plan: HousePlan, p: TourPoint) {
  const ox = plan.plot.width / 2;
  const oz = plan.plot.depth / 2;
  return { x: p.x - ox, z: p.y - oz, jump: p.jump, stop: p.stop ? { ...p.stop, lookX: p.stop.look.x - ox, lookZ: p.stop.look.y - oz } : undefined };
}

// A point `distance` feet further along the remaining path, so the camera turns smoothly into corners.
function lookAhead(points: { x: number; z: number }[], from: number, x: number, z: number, distance: number) {
  let px = x;
  let pz = z;
  let left = distance;
  for (let i = from; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - px, points[i].z - pz);
    if (seg >= left) return { x: px + ((points[i].x - px) / seg) * left, z: pz + ((points[i].z - pz) / seg) * left };
    left -= seg;
    px = points[i].x;
    pz = points[i].z;
  }
  return { x: px, z: pz };
}

function WalkRig({ plan, obstacles, onLocation }: { plan: HousePlan; obstacles: Obstacle[]; onLocation: (id: string | null) => void }) {
  const camera = useEyeCamera();
  const gl = useThree((s) => s.gl);
  const report = useLocationReporter(plan, onLocation);
  const eyeY = floorBase(plan, 0) + EYE;
  // Start outside the main entrance, looking at the door (same start as the tour).
  const start = useMemo(() => {
    const tour = buildTour(plan).map((p) => toThree(plan, p));
    const from = tour[0] ?? { x: 0, z: plan.plot.depth / 2 + 6 };
    const next = tour[1] ?? { x: 0, z: 0 };
    return { x: from.x, z: from.z, yaw: yawTowards(next.x - from.x, next.z - from.z) };
  }, [plan]);
  const state = useRef({ x: start.x, z: start.z, yaw: start.yaw, pitch: 0, keys: new Set<string>() });

  useEffect(() => {
    const s = state.current;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        s.keys.add(key);
        if (key.startsWith("arrow")) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase());
    let drag: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
    };
    const pointerMove = (e: PointerEvent) => {
      if (!drag) return;
      s.yaw -= (e.clientX - drag.x) * 0.005;
      s.pitch = Math.max(-1.1, Math.min(1.1, s.pitch - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = () => {
      drag = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    gl.domElement.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      gl.domElement.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    const k = s.keys;
    const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0);
    s.yaw += turn * dt * 1.8;
    const forward = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const strafe = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
    const speed = (k.has("shift") ? 10 : 5.5) * dt;
    const dx = (-Math.sin(s.yaw) * forward + Math.cos(s.yaw) * strafe) * speed;
    const dz = (-Math.cos(s.yaw) * forward - Math.sin(s.yaw) * strafe) * speed;
    // Slide along walls: try each axis separately.
    if (!blocked(obstacles, s.x + dx, s.z)) s.x += dx;
    if (!blocked(obstacles, s.x, s.z + dz)) s.z += dz;
    camera.position.set(s.x, eyeY, s.z);
    camera.rotation.set(s.pitch, s.yaw, 0);
    report(s.x, s.z);
  });

  return null;
}

const RADIUS = 1.1;
function blocked(obstacles: Obstacle[], x: number, z: number) {
  return obstacles.some((o) => x + RADIUS > o.minX && x - RADIUS < o.maxX && z + RADIUS > o.minZ && z - RADIUS < o.maxZ);
}

const TOUR_SPEED = 4;
const STOP_SECONDS = 4.2;

type TourRigProps = { plan: HousePlan; onEnd: () => void; onCut: () => void; onLocation: (id: string | null) => void };

function TourRig({ plan, onEnd, onCut, onLocation }: TourRigProps) {
  const camera = useEyeCamera(75);
  const report = useLocationReporter(plan, onLocation);
  const eyeY = floorBase(plan, 0) + EYE;
  const points = useMemo(() => buildTour(plan).map((p) => toThree(plan, p)), [plan]);
  const state = useRef({ i: 1, x: 0, z: 0, yaw: 0, pause: 0, pauseTotal: 1, sweep: 0, baseYaw: 0, done: false, started: false });

  useFrame((_, delta) => {
    const s = state.current;
    if (!points.length || s.done) return;
    const dt = Math.min(delta, 0.05);
    if (!s.started) {
      s.started = true;
      s.x = points[0].x;
      s.z = points[0].z;
      const ahead = lookAhead(points, 1, s.x, s.z, 6);
      s.yaw = yawTowards(ahead.x - s.x, ahead.z - s.z);
      // A moment to take in the front of the house before walking in.
      s.pause = s.pauseTotal = 2;
      s.sweep = 0;
      s.baseYaw = s.yaw;
    }

    if (s.pause > 0) {
      s.pause -= dt;
      const p = 1 - Math.max(s.pause, 0) / s.pauseTotal;
      // Turn to face into the room, then pan left and right across it.
      const target = s.baseYaw + Math.sin(p * Math.PI * 2) * s.sweep;
      s.yaw += wrapAngle(target - s.yaw) * Math.min(1, dt * 4);
    } else {
      let remaining = TOUR_SPEED * dt;
      while (remaining > 0 && s.i < points.length) {
        const target = points[s.i];
        if (target.jump) {
          s.x = target.x;
          s.z = target.z;
          remaining = 0;
          onCut();
        } else {
          const dx = target.x - s.x;
          const dz = target.z - s.z;
          const dist = Math.hypot(dx, dz);
          if (dist > remaining) {
            s.x += (dx / dist) * remaining;
            s.z += (dz / dist) * remaining;
            break;
          }
          s.x = target.x;
          s.z = target.z;
          remaining -= dist;
        }
        s.i++;
        if (target.stop) {
          s.pause = s.pauseTotal = STOP_SECONDS;
          s.sweep = 0.75;
          s.baseYaw = yawTowards(target.stop.lookX - s.x, target.stop.lookZ - s.z);
          if (target.jump) s.yaw = s.baseYaw;
          break;
        }
      }
      if (s.pause <= 0) {
        const ahead = lookAhead(points, s.i, s.x, s.z, 4);
        if (Math.hypot(ahead.x - s.x, ahead.z - s.z) > 0.3) s.yaw += wrapAngle(yawTowards(ahead.x - s.x, ahead.z - s.z) - s.yaw) * Math.min(1, dt * 2.5);
      }
      if (s.i >= points.length && s.pause <= 0) {
        s.done = true;
        onEnd();
      }
    }

    camera.position.set(s.x, eyeY, s.z);
    camera.rotation.set(-0.08, s.yaw, 0);
    report(s.x, s.z);
  });

  return null;
}

function Scene({
  plan,
  stage,
  maxFloor,
  cutRoof,
  palettes,
  exterior,
  selectedRoomId,
  onRoomClick,
  mode,
  elements,
  parts,
}: Props & { elements: Element[]; parts: Part[] }) {
  const roomTypes = useMemo(() => new Map(plan.rooms.map((r) => [r.id, r.type])), [plan]);
  const walking = mode !== "orbit";
  const effectiveStage = walking ? FINISHED : stage;
  const floorLimit = walking ? plan.floors - 1 : maxFloor;
  const topFloor = Math.min(floorLimit, plan.floors - 1);

  const visible = elements.flatMap((el) => {
    if (el.floor > floorLimit) return [];
    const show = isVisible(el, effectiveStage) && !(!walking && cutRoof && el.kind === "slab" && el.floor === topFloor);
    if (!show) return [];
    if (el.kind === "wall" && effectiveStage === 3) {
      // Brickwork stage: walls only reach lintel level.
      const limit = floorBase(plan, el.floor) + LINTEL;
      const bottom = el.position[1] - el.size[1] / 2;
      const top = Math.min(el.position[1] + el.size[1] / 2, limit);
      if (top <= bottom + 0.01) return [];
      return [
        {
          ...el,
          position: [el.position[0], (bottom + top) / 2, el.position[2]] as Element["position"],
          size: [el.size[0], top - bottom, el.size[2]] as Element["size"],
        },
      ];
    }
    return [el];
  });

  const click = (roomId: string | null) => (e: ThreeEvent<MouseEvent>) => {
    if (walking) return;
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
          <meshStandardMaterial
            {...material(el, effectiveStage, palettes, exterior, walking ? null : selectedRoomId)}
            {...(el.kind === "marking" ? { color: ROOM_COLORS[roomTypes.get(el.roomId ?? "") ?? "other"] } : {})}
          />
        </mesh>
      ))}
      {parts.map((p) => (
        <mesh key={p.key} position={p.position} onClick={click(p.roomId)}>
          {p.shape === "box" && <boxGeometry args={p.size} />}
          {p.shape === "cylinder" && <cylinderGeometry args={[p.size[0] / 2, p.size[0] / 2, p.size[1], 24]} />}
          {p.shape === "sphere" && <sphereGeometry args={[p.size[0] / 2, 24, 16]} />}
          <meshStandardMaterial color={p.color} roughness={0.7} transparent={p.opacity !== undefined} opacity={p.opacity ?? 1} />
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
    case "door":
      return stage >= FINISHED;
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
      return { transparent: true, opacity: 0.7, emissive, emissiveIntensity };
    case "plinth":
    case "column":
    case "slab":
      return { color: CONCRETE, roughness: 0.95, emissive, emissiveIntensity };
    case "glass":
      return { color: GLASS, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 };
    case "door":
      return { color: WOOD, roughness: 0.6 };
    case "floorFinish":
      return { color: palette?.floor ?? "#d6c7aa", roughness: 0.6, emissive, emissiveIntensity };
    case "wall": {
      if (stage < 5) return { color: BRICK, roughness: 1, emissive, emissiveIntensity };
      const color = el.exterior ? (exterior?.wall ?? PLASTER) : (palette?.wall ?? PLASTER);
      return { color, roughness: 0.85, emissive, emissiveIntensity };
    }
  }
}
