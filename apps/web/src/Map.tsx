import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { Parcel } from "../../../packages/contracts/src/index";
export function Map({
  parcels,
  select,
}: {
  parcels: Parcel[];
  select: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    const el = host.current!;
    const mount = async () => {
      await app.init({
        resizeTo: el,
        background: "#10242b",
        antialias: true,
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
      });
      initialized = true;
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      el.appendChild(app.canvas);
      const scene = new Container();
      app.stage.addChild(scene);
      scene.position.set(el.clientWidth / 2, 40);
      for (const p of [...parcels].sort((a, b) => a.x + a.y - (b.x + b.y))) {
        const x = (p.x - p.y) * 19,
          y = (p.x + p.y) * 10;
        const colors = {
          water: 0x245361,
          forest: 0x366452,
          plain: 0x71926a,
          hill: 0x8c927a,
        };
        const g = new Graphics();
        g.poly([x, y, x + 19, y + 10, x, y + 20, x - 19, y + 10])
          .fill(colors[p.terrain])
          .stroke({ color: 0x163b39, width: 0.6 });
        if (p.building) {
          const color = {
            housing: 0xe6d5ad,
            farm: 0xb8ad5a,
            factory: 0x7895a1,
            civic: 0xefbe72,
            road: 0x8a9995,
          }[p.building];
          const h = p.building === "road" ? 2 : p.building === "farm" ? 5 : 19;
          g.poly([
            x - 9,
            y + 9,
            x,
            y + 14,
            x,
            y + 14 - h,
            x - 9,
            y + 9 - h,
          ]).fill(color);
          g.poly([
            x,
            y + 14,
            x + 9,
            y + 9,
            x + 9,
            y + 9 - h,
            x,
            y + 14 - h,
          ]).fill(color - 0x181818);
          g.poly([
            x - 9,
            y + 9 - h,
            x,
            y + 4 - h,
            x + 9,
            y + 9 - h,
            x,
            y + 14 - h,
          ]).fill(color + 0x080808);
        }
        g.eventMode = "static";
        g.cursor = "pointer";
        g.on("pointertap", () => select(p.id));
        scene.addChild(g);
      }
      let dragging = false;
      let last = { x: 0, y: 0 };
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (e) => {
        dragging = true;
        last = { x: e.global.x, y: e.global.y };
      });
      app.stage.on("pointerup", () => {
        dragging = false;
      });
      app.stage.on("pointerupoutside", () => {
        dragging = false;
      });
      app.stage.on("pointermove", (e) => {
        if (dragging) {
          scene.x += e.global.x - last.x;
          scene.y += e.global.y - last.y;
          last = { x: e.global.x, y: e.global.y };
        }
      });
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const scale = Math.max(
          0.5,
          Math.min(2.5, scene.scale.x * (e.deltaY > 0 ? 0.9 : 1.1)),
        );
        scene.scale.set(scale);
      };
      app.canvas.addEventListener("wheel", wheel, { passive: false });
    };
    mount().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
      if (initialized) app.destroy(true, { children: true });
    };
  }, [parcels, select]);
  return (
    <div className="map" ref={host} aria-label="국가 아이소메트릭 지도">
      {error && (
        <p role="alert">
          지도 그래픽을 사용할 수 없습니다. 아래 필지 선택 목록을 이용하세요
        </p>
      )}
    </div>
  );
}
