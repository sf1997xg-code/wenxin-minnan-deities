import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const socketUrl = process.argv[2];
if (!socketUrl) {
  throw new Error("请传入 WebView 的 DevTools WebSocket 地址");
}

const socket = new WebSocket(socketUrl);
const pending = new Map();
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) {
    return;
  }
  const request = pending.get(message.id);
  if (!request) {
    return;
  }
  pending.delete(message.id);
  if (message.error) {
    request.reject(new Error(message.error.message));
  } else {
    request.resolve(message.result);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text
    );
  }
  return response.result.value;
}

async function waitFor(expression, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`等待条件超时：${expression}`);
}

async function enterQuestion(question) {
  await evaluate(`(() => {
    const input = document.querySelector("#question");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    setter.call(input, ${JSON.stringify(question)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await evaluate(`document.querySelector("#throw-button").click()`);
  await waitFor(
    `document.querySelector('#result-panel[data-state="complete"]')`
  );
}

await call("Page.enable");
await call("Runtime.enable");

const locationHref = await evaluate("location.href");
if (!locationHref.startsWith("https://localhost/")) {
  throw new Error(`APK 未从本地资源启动：${locationHref}`);
}
await waitFor("document.body.dataset.ready === 'true'");
if ((await evaluate("document.querySelectorAll('[data-deity]').length")) !== 4) {
  throw new Error("首页没有完整显示四位神明");
}

for (const [id, name] of [
  ["mazu", "妈祖"],
  ["guanyin", "观音菩萨"],
  ["guandi", "关帝爷"],
  ["xuantian", "玄天上帝"]
]) {
  await evaluate(`document.querySelector('[data-deity="${id}"]').click()`);
  await waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
  const deityState = await evaluate(`({
    name: document.querySelector("#ritual-deity-name").textContent.trim(),
    image: new URL(document.querySelector("#ritual-deity-image").src).pathname,
    loaded:
      document.querySelector("#ritual-deity-image").complete &&
      document.querySelector("#ritual-deity-image").naturalWidth >= 500
  })`);
  if (
    deityState.name !== name ||
    deityState.image !== `/assets/deities/seated-${id}.jpg` ||
    !deityState.loaded
  ) {
    throw new Error(`神明页面异常：${id}`);
  }
  await evaluate(`document.querySelector("#back-home").click()`);
  await waitFor(`!document.querySelector('[data-view="home"]').hidden`);
}

await evaluate(`document.querySelector('[data-deity="mazu"]').click()`);
await waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
await enterQuestion("离线测试第一问");

const firstResult = await evaluate(`({
  label: document.querySelector("#result-label").textContent.trim(),
  faceA: document.querySelector("#cup-stage").dataset.faceA,
  faceB: document.querySelector("#cup-stage").dataset.faceB,
  resultA: new URL(document.querySelector("#result-cup-a").src).pathname,
  resultB: new URL(document.querySelector("#result-cup-b").src).pathname,
  throwLocked:
    document.querySelector("#throw-button").hidden &&
    document.querySelector("#throw-button").disabled,
  actionLabels: [...document.querySelectorAll(".result-actions button")]
    .map((button) => button.textContent.trim())
})`);

if (!["圣杯", "笑杯", "阴杯"].includes(firstResult.label)) {
  throw new Error(`未知杯象：${firstResult.label}`);
}
if (!firstResult.throwLocked) {
  throw new Error("同一问题仍在允许再次掷杯");
}
if (!firstResult.resultA.endsWith(`cup-${firstResult.faceA}.png`)) {
  throw new Error("第一枚结果图与杯面不一致");
}
if (!firstResult.resultB.endsWith(`cup-${firstResult.faceB}.png`)) {
  throw new Error("第二枚结果图与杯面不一致");
}
if (JSON.stringify(firstResult.actionLabels) !== '["继续请示"]') {
  throw new Error(`结果操作异常：${firstResult.actionLabels.join(",")}`);
}

const resultClip = await evaluate(`(() => {
  const rect = document.querySelector("#result-panel").getBoundingClientRect();
  return {
    x: 0,
    y: Math.max(0, rect.top + window.scrollY - 20),
    width: window.innerWidth,
    height: rect.height + 40,
    scale: 1
  };
})()`);
const screenshot = await call("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
  clip: resultClip
});
const artifactDir = path.join(projectRoot, "test-artifacts");
await mkdir(artifactDir, { recursive: true });
await writeFile(
  path.join(artifactDir, "apk-result-offline.png"),
  Buffer.from(screenshot.data, "base64")
);

await evaluate(`document.querySelector("#continue-button").click()`);
await waitFor(
  `document.querySelector("#result-panel").hidden &&
   document.querySelector("#question").value === "" &&
   !document.querySelector("#throw-button").disabled`
);
await enterQuestion("离线测试第二问");

const apiRequests = await evaluate(
  `performance.getEntriesByType("resource")
    .map((entry) => new URL(entry.name).pathname)
    .filter((pathname) => pathname.startsWith("/api/"))`
);
if (apiRequests.length > 0) {
  throw new Error(`检测到 API 请求：${apiRequests.join(",")}`);
}
const externalRequests = await evaluate(
  `performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => !url.startsWith("https://localhost/"))`
);
if (externalRequests.length > 0) {
  throw new Error(`检测到外部请求：${externalRequests.join(",")}`);
}

console.log(
  JSON.stringify({
    ok: true,
    locationHref,
    firstResult,
    secondResult: await evaluate(
      `document.querySelector("#result-label").textContent.trim()`
    ),
    apiRequests,
    externalRequests
  })
);

socket.close();
