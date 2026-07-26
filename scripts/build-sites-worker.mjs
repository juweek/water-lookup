import { mkdir, writeFile } from "node:fs/promises";

const serverDir = new URL("../dist/server/", import.meta.url);
const workerPath = new URL("index.js", serverDir);
const worker = `function wantsHtml(request) {
  return request.method === "GET" &&
    (request.headers.get("accept") || "").includes("text/html");
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !wantsHtml(request)) return response;

    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
`;

await mkdir(serverDir, { recursive: true });
await writeFile(workerPath, worker);
