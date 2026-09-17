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
      server.middlewares.use("/__audio.mp3", (_request, response) => {
        const filename = findRootMp3();
        if (!filename) {
          response.statusCode = 404;
          response.end("Put one MP3 file in the repository root.");
          return;
        }
        response.setHeader("Content-Type", "audio/mpeg");
        response.setHeader("Cache-Control", "no-store");
        createReadStream(resolve(process.cwd(), filename)).pipe(response);
      });
    }
  };
}

export default defineConfig({
  plugins: [rootAudioPlugin()],
  server: { strictPort: true },
  build: { target: "es2022" }
});
