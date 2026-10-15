import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const require = createRequire(import.meta.url);
const baseURL = "http://127.0.0.1:4173";

let chromium;
let browser;

try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

if (chromium) {
  before(async () => {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  });

  after(async () => {
    await browser.close();
  });
}

const browserTest = chromium ? test : test.skip;

browserTest("homepage is responsive, local, and keyboard operable", async () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: "light" });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requests = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));

    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });

    for (const name of ["json", "time", "break"]) {
      await page.locator(`#workflow-tab-${name}`).click();
      await page.locator(`#workflow-panel-${name} img`).evaluate((image) => image.decode());
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => {}))));
    await page.evaluate(() => window.scrollTo(0, 0));

    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
      longHeadings: [...document.querySelectorAll("h1, h2, h3")]
        .filter((heading) => heading.getClientRects().length)
        .filter((heading) => {
          const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
          return Math.round(heading.getBoundingClientRect().height / lineHeight) > 2;
        })
        .map((heading) => heading.textContent.trim()),
    }));

    assert.ok(layout.scrollWidth <= layout.innerWidth, `${viewport.width}px layout overflows horizontally`);
    assert.equal(layout.brokenImages, 0);
    assert.deepEqual(layout.longHeadings, []);

    const actionBox = await page.locator(".hero-action").boundingBox();
    assert.ok(actionBox && actionBox.y + actionBox.height <= viewport.height, `${viewport.width}px CTA is below the fold`);

    for (const locator of [page.locator(".brand"), ...await page.locator(".site-nav a").all(), ...await page.locator('[role="tab"]').all()]) {
      const box = await locator.boundingBox();
      assert.ok(box && box.height >= 44, `${viewport.width}px interactive target is under 44px`);
    }

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.ok(requests.every((url) => url.startsWith(baseURL)), `unexpected third-party request at ${viewport.width}px`);

    if (viewport.width === 1440) {
      const breakTab = page.locator("#workflow-tab-break");
      await breakTab.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator("#workflow-tab-json").getAttribute("aria-selected"), "true");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "workflow-tab-json");
      assert.equal(await page.locator("#workflow-panel-json").isVisible(), true);
      assert.equal(await page.locator("#workflow-panel-break").isVisible(), false);

      await page.locator("#workflow-tab-time").click();
      assert.equal(await page.locator("#workflow-panel-time").isVisible(), true);

      await page.locator(".skip-link").focus();
      await page.waitForTimeout(220);
      const skipBox = await page.locator(".skip-link").boundingBox();
      assert.ok(skipBox && skipBox.y >= 0);
    }

    await context.close();
  }
});

browserTest("workflow content remains available without JavaScript", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);

  assert.equal(await page.locator(".workflow-panel:visible").count(), 3);
  assert.equal(await page.locator(".workflow-tabs").isVisible(), false);
  assert.equal(await page.locator("html").getAttribute("class"), null);

  await context.close();
});

browserTest("reduced motion keeps every reveal item visible", async () => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });

  const hidden = await page.locator("[data-reveal]").evaluateAll((items) =>
    items.filter((item) => {
      const style = getComputedStyle(item);
      const identityTransform = style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)";
      return style.opacity !== "1" || !identityTransform;
    }).length,
  );
  assert.equal(hidden, 0);

  await context.close();
});

browserTest("document pages retain readable measures and working actions", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await context.newPage();

  for (const path of ["privacy/", "support/"]) {
    await page.goto(`${baseURL}/${path}`, { waitUntil: "networkidle" });
    const width = await page.locator(".document").evaluate((element) => element.getBoundingClientRect().width);
    assert.ok(width <= 700, `${path} reading measure is too wide`);
  }

  const supportAction = await page.locator(".primary-link").boundingBox();
  assert.ok(supportAction && supportAction.height >= 44);

  await context.close();
});
