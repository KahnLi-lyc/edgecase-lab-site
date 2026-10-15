import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("homepage exposes a first-screen workflow action", async () => {
  const html = await read("index.html");

  assert.match(html, /href="#workflows"[^>]*>\s*See workflows\s*</);
  assert.match(html, /<section[^>]+id="workflows"/);
});

test("every page offers a skip link and a named main target", async () => {
  for (const path of ["index.html", "privacy/index.html", "support/index.html"]) {
    const html = await read(path);

    assert.match(html, /class="skip-link"[^>]+href="#main-content"/);
    assert.match(html, /<main[^>]+id="main-content"/);
  }
});

test("workflow explorer has three related tabs and panels", async () => {
  const html = await read("index.html");

  assert.match(html, /role="tablist"[^>]+aria-label="Workflows"/);

  for (const name of ["break", "json", "time"]) {
    assert.match(
      html,
      new RegExp(`id="workflow-tab-${name}"[\\s\\S]*?role="tab"[\\s\\S]*?aria-controls="workflow-panel-${name}"`),
    );
    assert.match(
      html,
      new RegExp(`id="workflow-panel-${name}"[\\s\\S]*?role="tabpanel"[\\s\\S]*?aria-labelledby="workflow-tab-${name}"[\\s\\S]*?tabindex="0"`),
    );
  }
});

test("all pages load the progressive enhancement script", async () => {
  for (const path of ["index.html", "privacy/index.html", "support/index.html"]) {
    const html = await read(path);
    const prefix = path === "index.html" ? "" : "../";

    assert.match(html, new RegExp(`<script src="${prefix}site\\.js" defer></script>`));
  }
});

test("styles avoid static ornament and the old horizontal rail", async () => {
  const css = await read("styles.css");

  assert.doesNotMatch(css, /box-shadow\s*:/);
  assert.doesNotMatch(css, /border(?:-(?:top|right|bottom|left))?\s*:\s*1px/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*auto/);
  assert.doesNotMatch(css, /grid-auto-flow\s*:\s*column/);
});

test("document pages keep their essential policy and support statements", async () => {
  const privacy = await read("privacy/index.html");
  const support = await read("support/index.html");

  assert.match(privacy, /EdgeCase Lab does not collect, transmit, sell, or share personal data\./);
  assert.match(privacy, /This website is hosted by GitHub Pages and does not add cookies, analytics, or tracking scripts\./);
  assert.match(support, /Do not include personal, confidential, or production data\./);
  assert.match(support, /EdgeCase Lab supports iPhone and iPad running iOS or iPadOS 17 or later\./);
});
