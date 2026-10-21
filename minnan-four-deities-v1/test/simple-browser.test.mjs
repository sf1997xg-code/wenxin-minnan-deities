import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createStaticServer } from "../src/server.mjs";
import { launchBrowser } from "./support/cdp-browser.mjs";


const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const artifactDir = path.join(projectRoot, "test-artifacts");


async function startApp() {
  const app = createStaticServer({
    publicDir: path.join(projectRoot, "public"),
    logger: { info() {} }
  });
  await app.listen(0, "127.0.0.1");
  return app;
}


async function cupArtworkStats(page, assetPath) {
  return page.evaluate(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(assetPath)};
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let topmostX = -1;
    let topmostY = canvas.height;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    let minBrightness = 255;
    let maxBrightness = 0;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] < 220) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (y < topmostY) {
          topmostY = y;
          topmostX = x;
        }
        red += pixels[offset];
        green += pixels[offset + 1];
        blue += pixels[offset + 2];
        const brightness =
          (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
        count += 1;
      }
    }

    return {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      topmostX: (topmostX - minX) / (maxX - minX),
      averageRed: red / count,
      averageGreen: green / count,
      averageBlue: blue / count,
      brightnessRange: maxBrightness - minBrightness
    };
  })()`);
}


test("home shows four loaded deity illustrations", async () => {
  await mkdir(artifactDir, { recursive: true });
  const app = await startApp();
  const browser = await launchBrowser();
  try {
    await browser.page.setViewport(1440, 1000);
    await browser.page.navigate(app.url);
    assert.equal(await browser.page.evaluate("document.title"), "问心");
    assert.equal(await browser.page.text(".brand-name"), "问心");
    assert.equal(await browser.page.count("[data-deity]"), 4);
    assert.equal(
      await browser.page.text("#home-title"),
      "请选择您想请示的神明"
    );
    assert.equal(
      await browser.page.evaluate(
        `document.querySelector('.home-heading').textContent.includes('一炉香火') ||
         document.querySelector('.home-heading').textContent.includes('闽南四位神明')`
      ),
      false
    );
    assert.ok(
      Number(
        await browser.page.evaluate(
          `parseFloat(getComputedStyle(document.querySelector('#home-title')).fontSize)`
        )
      ) >= 36
    );
    assert.equal(await browser.page.count(".deity-tone"), 0);
    assert.equal(await browser.page.count(".deity-meta"), 0);
    assert.equal(await browser.page.count("#ritual-deity-tone"), 0);
    assert.equal(
      await browser.page.evaluate(
        `[...document.querySelectorAll('[data-deity] img')]
          .every((image) => image.naturalWidth >= 350 && image.naturalHeight >= 990)`
      ),
      true
    );
    assert.deepEqual(
      await browser.page.evaluate(
        `[...document.querySelectorAll('[data-deity] img')].map((image) => ({
          alt: image.alt,
          loaded: image.complete && image.naturalWidth > 0,
          src: new URL(image.src).pathname
        }))`
      ),
      [
        { alt: "妈祖国风插画", loaded: true, src: "/assets/deities/mazu.jpg" },
        { alt: "观音菩萨国风插画", loaded: true, src: "/assets/deities/guanyin.jpg" },
        { alt: "关帝爷国风插画", loaded: true, src: "/assets/deities/guandi.jpg" },
        { alt: "玄天上帝国风插画", loaded: true, src: "/assets/deities/xuantian.jpg" }
      ]
    );
    assert.equal(
      await browser.page.evaluate(
        `document.querySelector('.temple-scene img').complete &&
         document.querySelector('.temple-scene img').naturalWidth > 0`
      ),
      true
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    await browser.page.screenshot(path.join(artifactDir, "simplified-home.png"));

    await browser.page.setViewport(390, 844, { mobile: true });
    await browser.page.navigate(app.url);
    assert.equal(
      await browser.page.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth"
      ),
      true
    );
    assert.equal(await browser.page.count("[data-deity]"), 4);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await browser.page.screenshot(path.join(artifactDir, "simplified-mobile-home.png"));
    assert.deepEqual(browser.page.errors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});


test("ritual cups use the supplied photographic wood-grain cutouts", async () => {
  const app = await startApp();
  const browser = await launchBrowser();
  try {
    await browser.page.setViewport(390, 844, { mobile: true });
    await browser.page.navigate(app.url);
    await browser.page.click('[data-deity="mazu"]');
    await browser.page.waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
    assert.ok(
      Number(
        await browser.page.evaluate(
          `document.querySelector('.cup').getBoundingClientRect().height`
        )
      ) >= 130
    );
    for (const face of ["flat", "round"]) {
      assert.deepEqual(
        await browser.page.evaluate(`fetch("/assets/jiaobei/cup-${face}.png")
          .then((response) => ({
            status: response.status,
            type: response.headers.get("content-type")
          }))`),
        { status: 200, type: "image/png" }
      );
      const stats = await cupArtworkStats(
        browser.page,
        `/assets/jiaobei/cup-${face}.png`
      );
      assert.ok(
        stats.height / stats.width >= 0.48,
        `${face} cup should be a tall crescent, got ${stats.height}x${stats.width}`
      );
      const hornRange = face === "flat" ? [0, 0.2] : [0.25, 0.65];
      assert.ok(
        stats.topmostX >= hornRange[0] && stats.topmostX <= hornRange[1],
        `${face} cup should have a lifted horn, got top ${stats.topmostX}`
      );
      assert.ok(
        stats.averageRed <= 150,
        `${face} cup should use deep red wood, got rgb(${stats.averageRed}, ${stats.averageGreen}, ${stats.averageBlue})`
      );
      assert.ok(stats.averageRed / stats.averageGreen >= 2);
      assert.ok(stats.brightnessRange >= 80);
    }
  } finally {
    await browser.close();
    await app.close();
  }
});


test("one throw per question, then continue with a fresh question", async () => {
  await mkdir(artifactDir, { recursive: true });
  const app = await startApp();
  const browser = await launchBrowser();
  try {
    await browser.page.setViewport(390, 844, { mobile: true });
    await browser.page.navigate(app.url);
    await browser.page.click('[data-deity="mazu"]');
    await browser.page.waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
    assert.equal(await browser.page.evaluate("document.querySelector('#question').maxLength"), 200);
    assert.equal(await browser.page.text("#toss-caption"), "写下问题后，掷杯一次");
    assert.equal(
      await browser.page.text("#throw-button span:last-child"),
      "掷杯"
    );

    await browser.page.fill("#question", "这次出行前，我还需要注意什么？");
    assert.equal(
      await browser.page.evaluate("document.querySelector('#question').value"),
      "这次出行前，我还需要注意什么？"
    );
    await browser.page.click("#throw-button");
    assert.equal(
      await browser.page.evaluate("document.querySelector('#throw-button').disabled"),
      true
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
    await browser.page.screenshot(path.join(artifactDir, "simplified-mobile-toss.png"));
    const animationRenderState = await browser.page.evaluate(`({
      cupWillChange: getComputedStyle(document.querySelector(".cup")).willChange,
      faceFilter: getComputedStyle(document.querySelector(".cup-face")).filter
    })`);
    assert.match(animationRenderState.cupWillChange, /transform/);
    assert.equal(animationRenderState.faceFilter, "none");
    await browser.page.waitFor(`document.querySelector('#result-panel[data-state="complete"]')`, 8_000);

    const resultText = await browser.page.text("#result-panel");
    assert.match(resultText, /^(圣杯|笑杯|阴杯)/);
    for (const forbidden of ["一平一凸", "两平", "两凸", "AI", "吉凶", "解签", "建议"]) {
      assert.equal(resultText.includes(forbidden), false);
    }
    assert.deepEqual(
      await browser.page.evaluate(
        `[...document.querySelectorAll('.result-actions button')]
          .map((button) => button.textContent.trim())`
      ),
      ["继续请示"]
    );
    assert.equal(
      await browser.page.evaluate(
        `document.querySelector('#throw-button').hidden &&
         document.querySelector('#throw-button').disabled`
      ),
      true
    );
    const visualResult = await browser.page.evaluate(`({
      faceA: document.querySelector('#cup-stage').dataset.faceA,
      faceB: document.querySelector('#cup-stage').dataset.faceB,
      resultFaceA: new URL(document.querySelector('#result-cup-a').src).pathname,
      resultFaceB: new URL(document.querySelector('#result-cup-b').src).pathname,
      label: document.querySelector('#result-label').textContent.trim()
    })`);
    assert.equal(
      visualResult.resultFaceA.endsWith(`cup-${visualResult.faceA}.png`),
      true
    );
    assert.equal(
      visualResult.resultFaceB.endsWith(`cup-${visualResult.faceB}.png`),
      true
    );
    const expectedLabel =
      visualResult.faceA === visualResult.faceB
        ? visualResult.faceA === "flat"
          ? "笑杯"
          : "阴杯"
        : "圣杯";
    assert.equal(visualResult.label, expectedLabel);
    assert.deepEqual(
      await browser.page.evaluate(
        `performance.getEntriesByType("resource")
          .map((entry) => new URL(entry.name).pathname)
          .filter((pathname) => pathname.startsWith("/api/"))`
      ),
      []
    );
    assert.deepEqual(
      await browser.page.evaluate(
        `({
          localStorage: localStorage.length,
          sessionStorage: sessionStorage.length,
          cookie: document.cookie
        })`
      ),
      { localStorage: 0, sessionStorage: 0, cookie: "" }
    );
    await browser.page.evaluate(
      `document.querySelector('#result-panel').scrollIntoView({ block: 'center' })`
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await browser.page.screenshot(path.join(artifactDir, "simplified-mobile-result.png"));
    assert.ok(
      Number(
        await browser.page.evaluate(
          `document.querySelector('.mini-cup').getBoundingClientRect().height`
        )
      ) >= 95
    );

    await browser.page.click("#continue-button");
    await browser.page.waitFor(
      `document.querySelector('#result-panel').hidden &&
       !document.querySelector('[data-view="ritual"]').hidden`
    );
    assert.equal(
      await browser.page.evaluate("document.querySelector('#question').value"),
      ""
    );
    assert.equal(await browser.page.text("#question-count"), "0 / 200");
    assert.equal(
      await browser.page.evaluate(
        `!document.querySelector('#throw-button').hidden &&
         !document.querySelector('#throw-button').disabled`
      ),
      true
    );
    assert.equal(await browser.page.text("#ritual-deity-name"), "妈祖");

    await browser.page.fill("#question", "下一件事我需要注意什么？");
    await browser.page.click("#throw-button");
    await browser.page.waitFor(
      `document.querySelector('#result-panel[data-state="complete"]')`,
      8_000
    );

    await browser.page.click("#back-home");
    await browser.page.waitFor(`!document.querySelector('[data-view="home"]').hidden`);
    assert.equal(await browser.page.count("[data-deity]"), 4);
    assert.deepEqual(browser.page.errors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});


test("all four deity cards enter the shared ritual page without API calls", async () => {
  const app = await startApp();
  const browser = await launchBrowser();
  try {
    for (const [id, name] of [
      ["mazu", "妈祖"],
      ["guanyin", "观音菩萨"],
      ["guandi", "关帝爷"],
      ["xuantian", "玄天上帝"]
    ]) {
      await browser.page.navigate(app.url);
      await browser.page.click(`[data-deity="${id}"]`);
      await browser.page.waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
      assert.equal(await browser.page.text("#ritual-deity-name"), name);
      assert.equal(
        await browser.page.evaluate(
          `new URL(document.querySelector('#ritual-deity-image').src).pathname`
        ),
        `/assets/deities/seated-${id}.jpg`
      );
      await browser.page.waitFor(
        `document.querySelector('#ritual-deity-image').complete &&
         document.querySelector('#ritual-deity-image').naturalWidth >= 500 &&
         document.querySelector('#ritual-deity-image').naturalHeight >= 640`,
        5_000
      );
      assert.equal(
        await browser.page.evaluate(
          `document.querySelector('#ritual-deity-image').complete &&
           document.querySelector('#ritual-deity-image').naturalWidth >= 500 &&
           document.querySelector('#ritual-deity-image').naturalHeight >= 640`
        ),
        true
      );
    }
    assert.deepEqual(
      await browser.page.evaluate(
        `performance.getEntriesByType("resource")
          .map((entry) => new URL(entry.name).pathname)
          .filter((pathname) => pathname.startsWith("/api/"))`
      ),
      []
    );
    assert.deepEqual(browser.page.errors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});


test("a failed illustration request leaves a usable fallback", async () => {
  const app = await startApp();
  const browser = await launchBrowser();
  try {
    await browser.page.call("Network.enable");
    await browser.page.call("Network.setBlockedURLs", {
      urls: ["*assets/deities/*"]
    });
    await browser.page.navigate(app.url);
    await browser.page.waitFor(
      `document.querySelector('[data-deity="guandi"]').classList.contains('image-error')`,
      5_000
    );
    assert.match(
      await browser.page.text('[data-deity="guandi"] .deity-image-wrap'),
      /画卷暂未展开/
    );
    await browser.page.click('[data-deity="guandi"]');
    await browser.page.waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
    await browser.page.waitFor(
      `document.querySelector('#ritual-portrait-frame').classList.contains('image-error')`,
      5_000
    );
    assert.equal(
      await browser.page.evaluate(
        "document.querySelector('#ritual-portrait-frame').classList.contains('image-error')"
      ),
      true
    );
    assert.match(await browser.page.text("#ritual-deity-name"), /关帝爷/);
  } finally {
    await browser.close();
    await app.close();
  }
});
