import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";


const EDGE_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";


async function waitForDebugPort(userDataDir, timeoutMs = 15_000) {
  const marker = path.join(userDataDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const [port] = (await readFile(marker, "utf8")).trim().split(/\r?\n/);
      if (port) {
        return Number(port);
      }
    } catch {
      // Browser startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Edge 调试端口启动超时");
}


class CdpPage {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.errors = [];

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(
          message.params.exceptionDetails?.exception?.description ||
            message.params.exceptionDetails?.text ||
            "Browser exception"
        );
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        this.errors.push(message.params.entry.text);
      }
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) {
        listener(message.params);
      }
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async initialize() {
    await Promise.all([
      this.call("Page.enable"),
      this.call("Runtime.enable"),
      this.call("Log.enable")
    ]);
  }

  async navigate(url) {
    await this.call("Page.navigate", { url });
    await this.waitFor(
      `document.readyState === "complete" && document.body?.dataset.ready === "true"`,
      12_000
    );
    await this.waitFor(`document.querySelectorAll('[data-deity]').length === 4`, 8_000);
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
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

  async waitFor(expression, timeoutMs = 8_000) {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeoutMs) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) {
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      `等待页面条件超时：${expression}${lastError ? `；${lastError.message}` : ""}`
    );
  }

  click(selector) {
    const errorMessage = JSON.stringify(`找不到元素：${selector}`);
    return this.evaluate(
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error(${errorMessage});
        element.click();
        return true;
      })()`
    );
  }

  fill(selector, value) {
    const errorMessage = JSON.stringify(`找不到输入框：${selector}`);
    return this.evaluate(
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error(${errorMessage});
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set;
        setter.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`
    );
  }

  text(selector) {
    return this.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`
    );
  }

  count(selector) {
    return this.evaluate(
      `document.querySelectorAll(${JSON.stringify(selector)}).length`
    );
  }

  async setViewport(width, height, { mobile = false } = {}) {
    await this.call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile
    });
  }

  async screenshot(filePath) {
    const { data } = await this.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await writeFile(filePath, Buffer.from(data, "base64"));
  }
}


export async function launchBrowser() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "minnan-edge-"));
  const process = spawn(
    EDGE_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: "ignore", windowsHide: true }
  );

  try {
    const debugPort = await waitForDebugPort(userDataDir);
    const targetResponse = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" }
    );
    const target = await targetResponse.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const page = new CdpPage(socket);
    await page.initialize();

    return {
      page,
      async close() {
        try {
          await page.call("Browser.close");
        } catch {
          // The browser may already be closing.
        }
        socket.close();
        process.kill();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await rm(userDataDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    process.kill();
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

