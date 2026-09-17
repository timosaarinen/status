import { createReadStream, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function findRootMp3(): string | undefined {
  return readdirSync(process.cwd())
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .sort()
    .find((name) => statSync(resolve(process.cwd(), name)).isFile());
}

function rootAudioPlugin(): Plugin {
  return {
    name: "root-audio",
    configureServer(server) {
      server.middlewares.use("/__audio.mp3", (request, response) => {
        const filename = findRootMp3();
        if (!filename) {
          response.statusCode = 404;
          response.end("Put one MP3 file in the repository root.");
          return;
        }

        const path = resolve(process.cwd(), filename);
        const size = statSync(path).size;
        const range = request.headers.range;

        response.setHeader("Content-Type", "audio/mpeg");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Accept-Ranges", "bytes");

        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
          if (!match) {
            response.statusCode = 416;
            response.setHeader("Content-Range", `bytes */${size}`);
            response.end();
            return;
          }

          const requestedStart = match[1] ? Number(match[1]) : undefined;
          const requestedEnd = match[2] ? Number(match[2]) : undefined;
          let start: number;
          let end: number;

          if (requestedStart === undefined) {
            const suffixLength = requestedEnd ?? 0;
            if (suffixLength <= 0) {
              response.statusCode = 416;
              response.setHeader("Content-Range", `bytes */${size}`);
              response.end();
              return;
            }
            start = Math.max(0, size - suffixLength);
            end = size - 1;
          } else {
            start = requestedStart;
            end = requestedEnd === undefined ? size - 1 : Math.min(requestedEnd, size - 1);
          }

          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
            response.statusCode = 416;
            response.setHeader("Content-Range", `bytes */${size}`);
            response.end();
            return;
          }

          response.statusCode = 206;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          response.setHeader("Content-Length", String(end - start + 1));
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          createReadStream(path, { start, end }).pipe(response);
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Length", String(size));
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        createReadStream(path).pipe(response);
      });
    }
  };
}

export default defineConfig({
  plugins: [rootAudioPlugin()],
  server: { strictPort: true },
  build: { target: "es2022" }
});
