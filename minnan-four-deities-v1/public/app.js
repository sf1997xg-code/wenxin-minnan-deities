import {
  DEITIES,
  createThrow,
  getDeity,
  isValidQuestion
} from "./ritual.mjs";


const state = {
  tossing: false,
  hasTossed: false
};

const views = new Map(
  [...document.querySelectorAll("[data-view]")].map((view) => [
    view.dataset.view,
    view
  ])
);

const elements = {
  deityGrid: document.querySelector("#deity-grid"),
  ritualName: document.querySelector("#ritual-deity-name"),
  ritualImage: document.querySelector("#ritual-deity-image"),
  ritualPortraitFrame: document.querySelector("#ritual-portrait-frame"),
  question: document.querySelector("#question"),
  questionCount: document.querySelector("#question-count"),
  questionError: document.querySelector("#question-error"),
  cupStage: document.querySelector("#cup-stage"),
  tossCaption: document.querySelector("#toss-caption"),
  throwButton: document.querySelector("#throw-button"),
  resultPanel: document.querySelector("#result-panel"),
  resultLabel: document.querySelector("#result-label"),
  resultCupA: document.querySelector("#result-cup-a"),
  resultCupB: document.querySelector("#result-cup-b")
};


function showView(name) {
  for (const [viewName, view] of views) {
    view.hidden = viewName !== name;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}


function renderDeities() {
  const fragment = document.createDocumentFragment();
  for (const deity of DEITIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deity-card";
    button.dataset.deity = deity.id;
    button.setAttribute("aria-label", `选择${deity.name}`);

    const imageWrap = document.createElement("span");
    imageWrap.className = "deity-image-wrap";
    const image = document.createElement("img");
    image.src = deity.image;
    image.alt = `${deity.name}国风插画`;
    image.decoding = "async";
    const fallback = document.createElement("span");
    fallback.className = "deity-fallback";
    fallback.textContent = "画卷暂未展开";
    image.addEventListener("error", () => {
      button.classList.add("image-error");
    });
    imageWrap.append(image, fallback);

    button.append(imageWrap);
    button.addEventListener("click", () => openRitual(deity.id));
    fragment.append(button);
  }
  elements.deityGrid.replaceChildren(fragment);
}


function resetRitual() {
  state.tossing = false;
  state.hasTossed = false;
  elements.question.value = "";
  elements.questionCount.textContent = "0 / 200";
  elements.questionError.textContent = "";
  elements.resultPanel.hidden = true;
  elements.resultPanel.dataset.state = "idle";
  elements.resultLabel.textContent = "";
  elements.cupStage.className = "cup-stage";
  elements.cupStage.dataset.faceA = "flat";
  elements.cupStage.dataset.faceB = "flat";
  elements.tossCaption.textContent = "写下问题后，掷杯一次";
  elements.throwButton.disabled = false;
  elements.throwButton.hidden = false;
}


function openRitual(id) {
  const deity = getDeity(id);
  resetRitual();
  elements.ritualName.textContent = deity.name;
  elements.ritualPortraitFrame.classList.remove("image-error");
  elements.ritualImage.src = deity.seatedImage;
  elements.ritualImage.alt = `${deity.name}端坐国风插画`;
  showView("ritual");
  requestAnimationFrame(() => elements.question.focus({ preventScroll: true }));
}


function backHome() {
  resetRitual();
  showView("home");
}


function continueRitual() {
  resetRitual();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.question.scrollIntoView({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth"
  });
  elements.question.focus({ preventScroll: true });
}


function cryptoRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / 0x1_0000_0000;
  }
  return Math.random();
}


function cupImage(face) {
  return face === "flat"
    ? "/assets/jiaobei/cup-flat.png"
    : "/assets/jiaobei/cup-round.png";
}


function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


function renderResult(outcome) {
  elements.cupStage.dataset.faceA = outcome.faceA;
  elements.cupStage.dataset.faceB = outcome.faceB;
  elements.resultLabel.textContent = outcome.label;
  elements.resultCupA.src = cupImage(outcome.faceA);
  elements.resultCupB.src = cupImage(outcome.faceB);
  elements.resultPanel.dataset.state = "complete";
  elements.resultPanel.hidden = false;
}


async function tossCups() {
  if (state.tossing || state.hasTossed) {
    return;
  }

  const question = elements.question.value;
  if (!isValidQuestion(question)) {
    elements.questionError.textContent =
      Array.from(question.trim()).length > 200
        ? "问题最多 200 字。"
        : "请先写下您想请示的问题。";
    elements.question.focus();
    return;
  }

  state.tossing = true;
  state.hasTossed = true;
  elements.questionError.textContent = "";
  elements.throwButton.disabled = true;
  elements.throwButton.hidden = true;
  elements.resultPanel.hidden = true;
  elements.resultPanel.dataset.state = "tossing";
  elements.tossCaption.textContent = "两片筊杯起落回旋……";

  const outcome = createThrow(cryptoRandom);
  elements.cupStage.dataset.faceA = outcome.faceA;
  elements.cupStage.dataset.faceB = outcome.faceB;
  elements.cupStage.className = "cup-stage is-tossing";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    await wait(2300);
  }

  elements.cupStage.className = "cup-stage";
  elements.tossCaption.textContent = "杯已落定";
  renderResult(outcome);
  state.tossing = false;
}


function bindEvents() {
  elements.ritualImage.addEventListener("error", () => {
    elements.ritualPortraitFrame.classList.add("image-error");
  });
  elements.question.addEventListener("input", () => {
    elements.questionCount.textContent =
      `${Array.from(elements.question.value).length} / 200`;
    elements.questionError.textContent = "";
  });
  elements.throwButton.addEventListener("click", tossCups);
  document.querySelector("#continue-button").addEventListener("click", continueRitual);
  document.querySelector("#back-home").addEventListener("click", backHome);
  document.querySelector("#brand-home").addEventListener("click", (event) => {
    event.preventDefault();
    backHome();
  });
}


renderDeities();
bindEvents();
document.body.dataset.ready = "true";
