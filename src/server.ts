import { Elysia, t } from "elysia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GameEngine } from "./game/engine";
import { PlaygroundStore } from "./game/playground";

const engine = new GameEngine();
const playground = new PlaygroundStore();

const publicDir = resolve(process.cwd(), "public");

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
    .get("/api/state", () => engine.snapshot())
    .get("/api/schema", () => engine.schema())
    .get("/api/playground/state", () => playground.state())
    .get("/api/playground/schema", () => playground.schema())
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
    .post("/api/playground/reset", () => playground.reset())
    .listen(3000);

  console.log(
    `DEAD SIGNAL web console running at http://${app.server?.hostname}:${app.server?.port}`,
  );
}
