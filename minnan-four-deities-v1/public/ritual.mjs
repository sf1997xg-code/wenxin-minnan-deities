const rawDeities = [
  {
    id: "mazu",
    name: "妈祖",
    image: "/assets/deities/mazu.jpg",
    seatedImage: "/assets/deities/seated-mazu.jpg"
  },
  {
    id: "guanyin",
    name: "观音菩萨",
    image: "/assets/deities/guanyin.jpg",
    seatedImage: "/assets/deities/seated-guanyin.jpg"
  },
  {
    id: "guandi",
    name: "关帝爷",
    image: "/assets/deities/guandi.jpg",
    seatedImage: "/assets/deities/seated-guandi.jpg"
  },
  {
    id: "xuantian",
    name: "玄天上帝",
    image: "/assets/deities/xuantian.jpg",
    seatedImage: "/assets/deities/seated-xuantian.jpg"
  }
];


const deitiesById = new Map(rawDeities.map((deity) => [deity.id, deity]));
const FACE_KEY = {
  "flat:flat": { result: "xiao", label: "笑杯" },
  "round:round": { result: "yin", label: "阴杯" },
  "flat:round": { result: "sheng", label: "圣杯" },
  "round:flat": { result: "sheng", label: "圣杯" }
};


export const DEITIES = Object.freeze(
  rawDeities.map((deity) => Object.freeze({ ...deity }))
);


export function getDeity(id) {
  const deity = deitiesById.get(id);
  if (!deity) {
    throw new Error(`未知神明：${id}`);
  }
  return deity;
}


export function resolveFaces(faceA, faceB) {
  if (!["flat", "round"].includes(faceA) || !["flat", "round"].includes(faceB)) {
    throw new Error(`无效杯面：${faceA}, ${faceB}`);
  }
  const outcome = FACE_KEY[`${faceA}:${faceB}`];
  return {
    faceA,
    faceB,
    result: outcome.result,
    label: outcome.label
  };
}


export function createThrow(randomValue) {
  if (typeof randomValue !== "function") {
    throw new Error("随机值必须是函数");
  }
  const first = Number(randomValue());
  const second = Number(randomValue());
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    first < 0 ||
    first >= 1 ||
    second < 0 ||
    second >= 1
  ) {
    throw new Error("随机值必须位于 0 到小于 1 的范围");
  }
  return resolveFaces(
    first < 0.5 ? "flat" : "round",
    second < 0.5 ? "flat" : "round"
  );
}


export function isValidQuestion(value) {
  if (typeof value !== "string") {
    return false;
  }
  const length = Array.from(value.trim()).length;
  return length >= 1 && length <= 200;
}
