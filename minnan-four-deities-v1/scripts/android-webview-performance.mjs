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

await call("Runtime.enable");
await waitFor("document.body.dataset.ready === 'true'");
await evaluate(`document.querySelector('[data-deity="mazu"]').click()`);
await waitFor(`!document.querySelector('[data-view="ritual"]').hidden`);
await evaluate(`(() => {
  const input = document.querySelector("#question");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  ).set;
  setter.call(input, "动画性能测试");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);

const result = await evaluate(`(async () => {
  const intervals = [];
  const longTasks = [];
  let observer;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push(entry.duration);
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    observer = null;
  }

  const durationMs = 2700;
  const startedAt = performance.now();
  let previous = startedAt;
  const framesDone = new Promise((resolve) => {
    function tick(now) {
      intervals.push(now - previous);
      previous = now;
      if (now - startedAt < durationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });

  document.querySelector("#throw-button").click();
  await framesDone;
  observer?.disconnect();

  const sorted = [...intervals].sort((left, right) => left - right);
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
  return {
    frameCount: intervals.length,
    averageFrameMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
    p95FrameMs: percentile(0.95),
    worstFrameMs: sorted.at(-1) || 0,
    framesOver25Ms: intervals.filter((value) => value > 25).length,
    longTaskCount: longTasks.length,
    totalLongTaskMs: longTasks.reduce((sum, value) => sum + value, 0),
    resultState: document.querySelector("#result-panel").dataset.state
  };
})()`);

console.log(JSON.stringify(result));
socket.close();
