import assert from "node:assert/strict";
import test from "node:test";

import {
  DEITIES,
  createThrow,
  getDeity,
  isValidQuestion,
  resolveFaces
} from "../public/ritual.mjs";


test("defines four distinct deity illustrations in display order", () => {
  assert.deepEqual(
    DEITIES.map((deity) => deity.name),
    ["妈祖", "观音菩萨", "关帝爷", "玄天上帝"]
  );
  assert.deepEqual(
    DEITIES.map((deity) => deity.image),
    [
      "/assets/deities/mazu.jpg",
      "/assets/deities/guanyin.jpg",
      "/assets/deities/guandi.jpg",
      "/assets/deities/xuantian.jpg"
    ]
  );
  assert.deepEqual(
    DEITIES.map((deity) => deity.seatedImage),
    [
      "/assets/deities/seated-mazu.jpg",
      "/assets/deities/seated-guanyin.jpg",
      "/assets/deities/seated-guandi.jpg",
      "/assets/deities/seated-xuantian.jpg"
    ]
  );
  assert.equal(DEITIES.every((deity) => !("tone" in deity)), true);
  assert.equal(getDeity("guanyin").name, "观音菩萨");
  assert.throws(() => getDeity("unknown"), /未知神明/);
});


test("maps two flat faces to 笑杯", () => {
  assert.deepEqual(resolveFaces("flat", "flat"), {
    faceA: "flat",
    faceB: "flat",
    result: "xiao",
    label: "笑杯"
  });
});


test("maps two round faces to 阴杯", () => {
  assert.deepEqual(resolveFaces("round", "round"), {
    faceA: "round",
    faceB: "round",
    result: "yin",
    label: "阴杯"
  });
});


test("maps one flat and one round face to 圣杯 in either order", () => {
  assert.equal(resolveFaces("flat", "round").label, "圣杯");
  assert.equal(resolveFaces("round", "flat").label, "圣杯");
});


test("generates each cup from a separate random value", () => {
  const values = [0.1, 0.9];
  const result = createThrow(() => values.shift());
  assert.deepEqual(result, {
    faceA: "flat",
    faceB: "round",
    result: "sheng",
    label: "圣杯"
  });
});


test("rejects invalid faces and random sources", () => {
  assert.throws(() => resolveFaces("edge", "flat"), /无效杯面/);
  assert.throws(() => createThrow(() => Number.NaN), /随机值/);
});


test("accepts questions from 1 to 200 characters", () => {
  assert.equal(isValidQuestion("问"), true);
  assert.equal(isValidQuestion("  问  "), true);
  assert.equal(isValidQuestion(""), false);
  assert.equal(isValidQuestion("   "), false);
  assert.equal(isValidQuestion("问".repeat(200)), true);
  assert.equal(isValidQuestion("问".repeat(201)), false);
});

