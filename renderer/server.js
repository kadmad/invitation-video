import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const app = express();
app.use(express.json({ limit: "50mb" }));

let bundleLocation = null;

// Track render progress and results per renderId
const renderJobs = new Map();

// Concurrency: how many frames Remotion renders in parallel
const FRAME_CONCURRENCY = parseInt(process.env.RENDER_CONCURRENCY || "2", 10);
// Max simultaneous render jobs this instance handles
const MAX_PARALLEL_JOBS = parseInt(process.env.MAX_PARALLEL_JOBS || "2", 10);
let activeJobs = 0;

function invalidateBundle() {
  bundleLocation = null;
}

async function ensureBundle() {
  if (bundleLocation) return bundleLocation;

  console.log("Bundling Remotion project...");
  const frontendDir = fs.existsSync("/frontend/src") ? "/frontend" : path.resolve("../frontend");
  const entryPoint = path.join(frontendDir, "src/remotion/index.ts");

  bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        "@": path.join(frontendDir, "src"),
      };
      return config;
    },
  });

  console.log("Bundle ready at:", bundleLocation);
  return bundleLocation;
}

// Async render — runs in background, caller polls /progress/:id
async function doRender(id, params) {
  const { compositionId, durationInFrames, fps, width, height, inputProps } = params;

  try {
    const bundled = await ensureBundle();
    const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

    const composition = await selectComposition({
      serveUrl: bundled,
      id: compositionId || "GenericTemplate",
      inputProps: inputProps || {},
      browserExecutable: chromiumPath,
      chromiumOptions: {
        gl: "swangle",
        disableWebSecurity: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    });

    if (durationInFrames) composition.durationInFrames = durationInFrames;
    if (fps) composition.fps = fps;
    if (width) composition.width = width;
    if (height) composition.height = height;

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-render-"));
    const outputPath = path.join(outputDir, "output.mp4");

    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: inputProps || {},
      browserExecutable: chromiumPath,
      concurrency: FRAME_CONCURRENCY,
      chromiumOptions: {
        gl: "swangle",
        disableWebSecurity: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
      onProgress: ({ progress }) => {
        const job = renderJobs.get(id);
        if (job) job.progress = Math.round(progress * 100);
      },
    });

    const job = renderJobs.get(id);
    if (job) {
      job.progress = 100;
      job.status = "done";
      job.outputPath = outputPath;
      job.outputDir = outputDir;
    }
  } catch (err) {
    console.error(`Render ${id} failed:`, err);
    const job = renderJobs.get(id);
    if (job) {
      job.status = "failed";
      job.error = err.message;
    }
  } finally {
    activeJobs--;
  }
}

// POST /render — start render, return renderId immediately (non-blocking)
// Also supports ?sync=true for backward compat (blocking mode)
app.post("/render", async (req, res) => {
  const {
    compositionId = "GenericTemplate",
    durationInFrames,
    fps,
    width,
    height,
    inputProps,
    renderId,
  } = req.body;

  const sync = req.query.sync === "true";
  const id = renderId || crypto.randomUUID();

  renderJobs.set(id, {
    progress: 0,
    status: "rendering",
    outputPath: null,
    outputDir: null,
    error: null,
    createdAt: Date.now(),
  });

  if (activeJobs >= MAX_PARALLEL_JOBS) {
    renderJobs.set(id, { progress: 0, status: "queued", error: null });
    // Wait for a slot
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (activeJobs < MAX_PARALLEL_JOBS) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
    const job = renderJobs.get(id);
    if (job) job.status = "rendering";
  }

  activeJobs++;

  if (sync) {
    // Blocking mode — wait for render, stream file back (legacy)
    await doRender(id, { compositionId, durationInFrames, fps, width, height, inputProps });
    const job = renderJobs.get(id);
    if (!job || job.status === "failed") {
      return res.status(500).json({ error: job?.error || "Render failed" });
    }
    const stat = fs.statSync(job.outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("X-Render-Id", id);
    const stream = fs.createReadStream(job.outputPath);
    stream.pipe(res);
    stream.on("end", () => {
      fs.rmSync(job.outputDir, { recursive: true, force: true });
      setTimeout(() => renderJobs.delete(id), 60000);
    });
  } else {
    // Non-blocking mode — return immediately, caller polls progress + downloads
    res.json({ renderId: id, status: "rendering" });
    doRender(id, { compositionId, durationInFrames, fps, width, height, inputProps });
  }
});

// GET /progress/:id — poll render progress
app.get("/progress/:id", (req, res) => {
  const job = renderJobs.get(req.params.id);
  if (!job) return res.json({ progress: 0, status: "unknown" });
  res.json({ progress: job.progress, status: job.status, error: job.error });
});

// GET /download/:id — download completed render
app.get("/download/:id", (req, res) => {
  const job = renderJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Not found" });
  if (job.status !== "done") return res.status(400).json({ error: "Not ready", status: job.status });

  const stat = fs.statSync(job.outputPath);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("X-Render-Id", req.params.id);

  const stream = fs.createReadStream(job.outputPath);
  stream.pipe(res);
  stream.on("end", () => {
    fs.rmSync(job.outputDir, { recursive: true, force: true });
    setTimeout(() => renderJobs.delete(req.params.id), 60000);
  });
});

// Invalidate bundle cache
app.post("/invalidate", (req, res) => {
  invalidateBundle();
  res.json({ status: "ok", message: "Bundle cache cleared" });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bundled: !!bundleLocation,
    activeJobs,
    maxParallelJobs: MAX_PARALLEL_JOBS,
    frameConcurrency: FRAME_CONCURRENCY,
  });
});

// Clean up stale jobs every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of renderJobs) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      if (job.outputDir) {
        try { fs.rmSync(job.outputDir, { recursive: true, force: true }); } catch {}
      }
      renderJobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.RENDERER_PORT || 3100;

ensureBundle()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Remotion renderer listening on port ${PORT} (concurrency=${FRAME_CONCURRENCY}, maxJobs=${MAX_PARALLEL_JOBS})`);
    });
  })
  .catch((err) => {
    console.error("Failed to bundle:", err);
    process.exit(1);
  });
