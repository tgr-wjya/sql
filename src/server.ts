import { Elysia, t } from "elysia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GameEngine } from "./game/engine";
import { PlaygroundStore } from "./game/playground";

const engine = new GameEngine();
const playground = new PlaygroundStore();

const publicDir = resolve(process.cwd(), "public");

function currentPlaygroundSeed() {
  return engine.playgroundSeed();
}

function serveStatic(fileName: string, contentType: string): Response {
  const absolutePath = resolve(publicDir, fileName);
  const content = readFileSync(absolutePath, "utf8");
  return new Response(content, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

export function startServer(): void {
  const app = new Elysia()
    .get("/", () => serveStatic("index.html", "text/html; charset=utf-8"))
    .get("/styles.css", () =>
      serveStatic("styles.css", "text/css; charset=utf-8"),
    )
    .get("/app.js", () =>
      serveStatic("app.js", "application/javascript; charset=utf-8"),
    )
    .get("/builder.js", () =>
      serveStatic("builder.js", "application/javascript; charset=utf-8"),
    )
    .get("/api/state", () => engine.snapshot())
    .get("/api/schema", () => engine.schema())
    .get("/api/graph", () => engine.graph())
    .get("/api/playground/state", () => {
      const seed = currentPlaygroundSeed();
      if (!seed.ok) {
        return {
          ok: false,
          starterSql: "",
          message: seed.message,
        };
      }
      return playground.state(seed.seedKey, seed.setupSql, seed.starterSql);
    })
    .get("/api/playground/schema", () => {
      const seed = currentPlaygroundSeed();
      if (!seed.ok) {
        return {
          ok: false,
          schema: "",
          message: seed.message,
        };
      }
      playground.state(seed.seedKey, seed.setupSql, seed.starterSql);
      return playground.schema();
    })
    .get("/api/playground/graph", () => {
      const seed = currentPlaygroundSeed();
      if (!seed.ok) {
        return {
          ok: false,
          graph: {
            tables: [],
            foreignKeys: [],
            generatedAt: new Date().toISOString(),
          },
          message: seed.message,
        };
      }
      playground.state(seed.seedKey, seed.setupSql, seed.starterSql);
      return playground.graph();
    })
    .post(
      "/api/run",
      ({ body }: { body: { sql: string } }) => {
        return engine.run(body.sql);
      },
      {
        body: t.Object({
          sql: t.String(),
        }),
      },
    )
    .post(
      "/api/playground/run",
      ({ body }: { body: { sql: string } }) => {
        const seed = currentPlaygroundSeed();
        if (seed.ok) {
          playground.state(seed.seedKey, seed.setupSql, seed.starterSql);
        }
        return playground.run(body.sql);
      },
      {
        body: t.Object({
          sql: t.String(),
        }),
      },
    )
    .post("/api/hint", () => engine.hint())
    .post("/api/advance", () => engine.advance())
    .post("/api/reset", () => engine.reset())
    .post("/api/playground/reset", () => {
      const seed = currentPlaygroundSeed();
      if (!seed.ok) {
        return {
          ok: false,
          starterSql: "",
          message: seed.message,
        };
      }
      return playground.reset(seed.seedKey, seed.setupSql, seed.starterSql);
    })
    .listen(3000);

  console.log(
    `DEAD SIGNAL web console running at http://${app.server?.hostname}:${app.server?.port}`,
  );
}
