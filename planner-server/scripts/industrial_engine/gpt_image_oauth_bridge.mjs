#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHATGPT_URL = process.env.GPT_IMAGE_OAUTH_CHATGPT_URL || "https://chatgpt.com/";
const DEFAULT_TIMEOUT_MS = Number(process.env.GPT_IMAGE_OAUTH_TIMEOUT_SECONDS || 900) * 1000;
const LOGIN_WAIT_MS = Number(process.env.GPT_IMAGE_OAUTH_LOGIN_WAIT_SECONDS || 900) * 1000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      throw new Error(`unexpected_argument:${value}`);
    }
    const key = value.slice(2);
    if (["health", "login"].includes(key)) {
      args[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`missing_value:${value}`);
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function boolEnv(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolveChromePath() {
  return process.env.GPT_IMAGE_OAUTH_CHROME_PATH || "/usr/bin/google-chrome";
}

function resolveUserDataDir() {
  return (
    process.env.GPT_IMAGE_OAUTH_USER_DATA_DIR ||
    path.join(os.homedir(), "4wall-worker", "gpt-image-bridge", "profile")
  );
}

async function acquireLock(userDataDir) {
  const lockPath = `${userDataDir}.lock`;
  try {
    await mkdir(lockPath, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`bridge_profile_locked:${lockPath}`);
    }
    throw error;
  }
  return async () => {
    await rm(lockPath, { recursive: true, force: true });
  };
}

async function importPlaywright() {
  try {
    return await import("playwright-core");
  } catch (error) {
    throw new Error(`playwright_core_missing:${error.message}`);
  }
}

async function launchBrowser() {
  const { chromium } = await importPlaywright();
  const cdpUrl = process.env.GPT_IMAGE_OAUTH_CDP_URL;
  if (cdpUrl) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] || (await browser.newContext({ viewport: { width: 1680, height: 1100 } }));
    return {
      context,
      release: async () => {},
      closeContext: false,
      mode: "cdp",
    };
  }
  const userDataDir = resolveUserDataDir();
  await mkdir(userDataDir, { recursive: true });
  const release = await acquireLock(userDataDir);
  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: resolveChromePath(),
      headless: boolEnv("GPT_IMAGE_OAUTH_HEADLESS", false),
      viewport: { width: 1680, height: 1100 },
      acceptDownloads: true,
      args: ["--disable-dev-shm-usage"],
    });
    return { context, release, closeContext: true, mode: "persistent" };
  } catch (error) {
    await release();
    throw error;
  }
}

async function closeBrowserSession(session) {
  if (session.closeContext) {
    await session.context.close().catch(() => {});
  }
  await session.release();
}

async function firstPage(context) {
  return context.pages()[0] || context.newPage();
}

async function gotoChatGPT(page, { forceReload = false } = {}) {
  await page.bringToFront().catch(() => {});
  const currentUrl = page.url();
  if (forceReload || !currentUrl.startsWith("https://chatgpt.com/")) {
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } else {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
}

async function evaluateWithTimeout(page, callback, timeoutMs = 10000) {
  let timeout;
  try {
    return await Promise.race([
      page.evaluate(callback),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("browser_evaluate_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function authState(page) {
  return evaluateWithTimeout(page, () => {
    const text = document.body?.innerText || "";
    const loginLike = Array.from(document.querySelectorAll("a,button")).some((node) => {
      const value = (node.textContent || "").trim().toLowerCase();
      return ["log in", "login", "sign in", "登入", "註冊", "sign up"].includes(value);
    });
    const composer = Boolean(
      document.querySelector("textarea[data-testid='prompt-textarea']") ||
        document.querySelector("#prompt-textarea") ||
        document.querySelector("[contenteditable='true']")
    );
    const url = location.href;
    return {
      authenticated: composer && !loginLike && !url.includes("/auth/login"),
      composer,
      loginLike,
      url,
      title: document.title,
      textSample: text.slice(0, 120),
    };
  });
}

async function waitForAuth(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await authState(page);
    if (state.authenticated) {
      return state;
    }
    await page.waitForTimeout(3000);
  }
  return authState(page);
}

async function health({ login = false } = {}) {
  const session = await launchBrowser();
  const { context } = session;
  try {
    const page = await firstPage(context);
    await gotoChatGPT(page);
    const state = login ? await waitForAuth(page, LOGIN_WAIT_MS) : await authState(page);
    outputJson({
      authenticated: state.authenticated,
      model: process.env.GPT_IMAGE_OAUTH_MODEL || "gpt-image-2",
      surface: "chatgpt-browser-oauth",
      mode: session.mode,
      url: state.url,
      title: state.title,
      userDataDir: resolveUserDataDir(),
    });
    if (!state.authenticated) {
      process.exitCode = 1;
    }
  } finally {
    await closeBrowserSession(session);
  }
}

async function composerLocator(page) {
  const selectors = [
    "textarea[data-testid='prompt-textarea']",
    "#prompt-textarea",
    "[data-testid='composer-text-input']",
    "div[contenteditable='true']",
    "textarea",
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }
  throw new Error("chatgpt_composer_not_found");
}

async function sendButtonLocator(page) {
  const selectors = [
    "[data-testid='send-button']",
    "button[aria-label='Send prompt']",
    "button[aria-label='Send message']",
    "button[type='submit']",
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }
  return null;
}

async function largeImages(page) {
  return page.evaluate(() =>
    Array.from(document.images)
      .map((img, index) => {
        const rect = img.getBoundingClientRect();
        return {
          index,
          src: img.currentSrc || img.src || "",
          alt: img.alt || "",
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((img) => img.naturalWidth >= 256 && img.naturalHeight >= 256)
  );
}

function buildPrompt(input) {
  return [
    "Generate one photorealistic industrial factory reference image for a World Labs Marble 3D world-generation pipeline.",
    "Use the scene below as the visual source. Create a grounded Taiwan SME factory environment; no sci-fi, fantasy, game art, diagram, UI, watermark, caption, or collage.",
    "The image should be a single wide-angle realistic camera view suitable as image grounding for 3D scene generation.",
    `Requested size: ${input.size || "1536x1024"}.`,
    "",
    "Scene name:",
    input.sceneName || "industrial scene",
    "",
    "Positive prompt:",
    input.prompt || "",
    "",
    "Negative prompt:",
    input.negativePrompt || "",
    "",
    "Return only the image.",
  ].join("\n");
}

async function submitPrompt(page, prompt) {
  const composer = await composerLocator(page);
  await composer.click();
  const tagName = await composer.evaluate((node) => node.tagName.toLowerCase());
  if (tagName === "textarea") {
    await composer.fill(prompt);
  } else {
    await page.keyboard.insertText(prompt);
  }
  const send = await sendButtonLocator(page);
  if (send && (await send.isEnabled().catch(() => false))) {
    await send.click();
  } else {
    await page.keyboard.press("Enter");
  }
}

async function waitForGeneratedImage(page, seenSrcs, timeoutMs) {
  await page
    .waitForFunction(
      (seen) => {
        const large = Array.from(document.images).filter((img) => {
          const src = img.currentSrc || img.src || "";
          return img.naturalWidth >= 512 && img.naturalHeight >= 512 && !seen.includes(src);
        });
        return large.length > 0;
      },
      seenSrcs,
      { timeout: timeoutMs }
    )
    .catch(() => {});

  const selected = await page.evaluate((seen) => {
    document.querySelectorAll("[data-gpt-image-bridge-target='1']").forEach((node) => {
      node.removeAttribute("data-gpt-image-bridge-target");
    });
    const candidates = Array.from(document.images).filter((img) => {
      const src = img.currentSrc || img.src || "";
      return img.naturalWidth >= 512 && img.naturalHeight >= 512 && !seen.includes(src);
    });
    const fallback = Array.from(document.images).filter((img) => img.naturalWidth >= 512 && img.naturalHeight >= 512);
    const target = candidates[candidates.length - 1] || fallback[fallback.length - 1];
    if (!target) {
      return null;
    }
    target.setAttribute("data-gpt-image-bridge-target", "1");
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    return {
      src: target.currentSrc || target.src || "",
      alt: target.alt || "",
      naturalWidth: target.naturalWidth || 0,
      naturalHeight: target.naturalHeight || 0,
      renderedWidth: Math.round(rect.width),
      renderedHeight: Math.round(rect.height),
    };
  }, seenSrcs);
  if (!selected) {
    throw new Error("generated_image_not_found");
  }
  return selected;
}

async function generate(args) {
  if (!args.input || !args.output || !args["metadata-output"]) {
    throw new Error("missing_required_generate_args");
  }
  const input = JSON.parse(await readFile(args.input, "utf8"));
  const session = await launchBrowser();
  const { context } = session;
  try {
    const page = await firstPage(context);
    await gotoChatGPT(page);
    const state = await authState(page);
    if (!state.authenticated) {
      throw new Error("gpt_image_oauth_not_authenticated");
    }
    const before = await largeImages(page);
    const seenSrcs = before.map((item) => item.src);
    const prompt = buildPrompt(input);
    await submitPrompt(page, prompt);
    const selected = await waitForGeneratedImage(page, seenSrcs, DEFAULT_TIMEOUT_MS);
    await page.locator("[data-gpt-image-bridge-target='1']").screenshot({
      path: args.output,
      type: "png",
      timeout: 60000,
    });
    await writeFile(
      args["metadata-output"],
      `${JSON.stringify(
        {
          provider: "chatgpt-browser-oauth",
          requestedModel: input.model || process.env.GPT_IMAGE_OAUTH_MODEL || "gpt-image-2",
          purpose: input.purpose,
          jobId: input.jobId,
          sceneName: input.sceneName,
          requestedSize: input.size,
          returnFormat: input.returnFormat || "png",
          selectedImage: selected,
          generatedAt: new Date().toISOString(),
          pageUrl: page.url(),
          bridgeMode: session.mode,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    outputJson({ ok: true, output: args.output, metadataOutput: args["metadata-output"] });
  } finally {
    await closeBrowserSession(session);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.health) {
    await health();
    return;
  }
  if (args.login) {
    await health({ login: true });
    return;
  }
  await generate(args);
}

main()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    outputJson({
      authenticated: false,
      ok: false,
      error: error?.message || String(error),
      surface: "chatgpt-browser-oauth",
    });
    process.exit(1);
  });
