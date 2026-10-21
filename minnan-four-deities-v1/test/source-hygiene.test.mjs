import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


test("styles only target classes used by the page runtime", async () => {
  const sourceFiles = [
    "public/index.html",
    "public/app.js",
    "public/ritual.mjs"
  ];
  const [css, ...sources] = await Promise.all([
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    ...sourceFiles.map((file) =>
      readFile(new URL(`../${file}`, import.meta.url), "utf8")
    )
  ]);
  const runtime = sources.join("\n");
  const classes = new Set(
    [...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(
      (match) => match[1]
    )
  );
  const unused = [...classes].filter(
    (name) =>
      !new RegExp(`(?<![A-Za-z0-9_-])${name}(?![A-Za-z0-9_-])`).test(runtime)
  );

  assert.deepEqual(unused, []);
});
