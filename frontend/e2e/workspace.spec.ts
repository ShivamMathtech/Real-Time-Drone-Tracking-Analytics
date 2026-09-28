import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const backend = process.env.E2E_API_URL || "http://127.0.0.1:8000";
test("dashboard demo, controls, visual modes, sessions, snapshots, exports and replay", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("SYSTEM ONLINE")).toBeVisible();
  await page.getByRole("button", { name: "Demo mode", exact: true }).click();
  await expect(page.getByRole("button", { name: /Drone #1/ })).toBeVisible();
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Drone #2/ }).click();
  await expect(page.getByRole("heading", { name: "Drone #2" })).toBeVisible();
  await page
    .getByRole("button", { name: "Record frames", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const p = await request.get(backend + "/api/tracks/2");
      return (await p.json()).duration;
    })
    .toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Thermal simulation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thermal simulation", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Bounding box", exact: true }).click();
  const snapshot = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG snapshot" }).click();
  expect((await snapshot).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await page.getByLabel("Session name").fill("E2E simulated flight");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save session" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const format of ["CSV", "JSON"]) {
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    expect((await d).suggestedFilename()).toMatch(
      new RegExp("\\." + format.toLowerCase() + "$"),
    );
  }
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "../docs/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "ANALYTICS", exact: true }).click();
  await expect(
    page.getByText("Detection observations", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "LOGS", exact: true }).click();
  await expect(
    page.getByText("Source started: demo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "LIVE TRACKING", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Saved sessions", exact: true })
    .click();
  const row = page
    .locator(".session-row")
    .filter({
      has: page.getByRole("heading", { name: "E2E simulated flight" }),
    });
  await row.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByText("SESSION REPLAY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Replay timeline" })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "Exit replay" }).click();
  expect(errors).toEqual([]);
});
test("settings save, phone/tablet layout, camera stream and reconnect", async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    (window as any).__testSockets = sockets;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    };
  });
  await page.goto("/settings");
  await expect(page.getByText("SYSTEM ONLINE")).toBeVisible();
  await page.getByLabel("Processed FPS limit").fill("15");
  await page.getByRole("button", { name: "Save & apply settings" }).click();
  await expect
    .poll(async () => {
      const r = await request.get(backend + "/api/settings");
      return (await r.json()).fps_limit;
    })
    .toBe(15);
  await page.getByRole("link", { name: "LIVE TRACKING", exact: true }).click();
  await page.getByRole("button", { name: "Demo mode", exact: true }).click();
  await expect(page.getByRole("button", { name: /Drone #1/ })).toBeVisible();
  for (const size of [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      page.getByRole("heading", { name: "Live camera feed" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({
    path: "../docs/dashboard-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const connectionsBefore = await page.evaluate(() => {
    const sockets = (window as any).__testSockets.filter((s: WebSocket) => s.url.endsWith("/ws/tracking"));
    const open = sockets.find((s: WebSocket) => s.readyState === WebSocket.OPEN);
    if (!open) throw new Error("No active tracking socket to test");
    open.close();
    return sockets.length;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__testSockets.filter((s: WebSocket) =>
            s.url.endsWith("/ws/tracking"),
          ).length,
      ),
    )
    .toBeGreaterThan(connectionsBefore);
  await expect(page.getByText("SYSTEM ONLINE")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect
    .poll(async () => {
      const s = await request.get(backend + "/api/sessions");
      return (await s.json())[0].source;
    })
    .toBe("webcam");
  await expect(page.getByText("● LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close source" }).click();
  expect(errors).toEqual([]);
});

test("uploaded video → actual ONNX inference → tracking UI → CSV", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await request.post(backend + "/api/source/stop");
  const loaded = await request.post(backend + "/api/models/load", {
    data: { filename: "synthetic_e2e_fixture.onnx" },
  });
  expect(loaded.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByText("SYSTEM ONLINE")).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(process.env.E2E_VIDEO_FILE!);
  await expect(
    page.getByRole("dialog", { name: "Video ready for analysis" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start analysis", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Drone #1/ })).toBeVisible();
  await expect
    .poll(async () => {
      const r = await request.get(backend + "/api/tracks/1");
      return (await r.json()).velocity?.speed || 0;
    })
    .toBeGreaterThan(10);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const file = await download;
  const text = await fs.readFile((await file.path())!, "utf8");
  expect(text).toContain("velocity_x");
  expect(text).toContain("vision");
  await page.getByRole("button", { name: "Close source" }).click();
  expect(errors).toEqual([]);
});
