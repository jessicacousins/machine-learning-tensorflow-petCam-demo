const CAM_WIDTH = 640;
const CAM_HEIGHT = 480;
const MIN_DETECTION_CONFIDENCE = 0.5;
const ANIMATION_TIME = 500;

const MIN_ALERT_COOLDOWN_TIME = 60;

const STEP_1 = document.getElementById("step1");
const STEP_2 = document.getElementById("step2");
const STEP_3 = document.getElementById("step3");

const ENABLE_WEBCAM_BTN = document.getElementById("webcamButton");
const ENABLE_DETECTION_BTN = document.getElementById("enableDetection");

const CHOSEN_ITEM = document.getElementById("item");
const CHOSEN_ITEM_GUI = document.getElementById("chosenItem");
const CHOSEN_PET = document.getElementById("pet");
const MONITORING_TEXT = document.getElementById("monitoring");

const VIDEO = document.getElementById("webcam");
const LIVE_VIEW = document.getElementById("liveView");

const CANVAS = document.createElement("canvas");
const CTX = CANVAS.getContext("2d");

var children = [];
var model = undefined;
var ratioX = 1;
var ratioY = 1;
var state = "setup";
var lastNaughtyAnimalCount = 0;
var sendAlerts = true;
var foundMonitoredObjects = [];

cocoSsd.load().then(function (loadedModel) {
  model = loadedModel;

  ENABLE_WEBCAM_BTN.classList.remove("disabled");
});

function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
  ENABLE_WEBCAM_BTN.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

function enableCam(event) {
  if (!model) {
    console.log("Wait! Model not loaded yet.");
    return;
  }

  document.documentElement.requestFullscreen({
    navigationUI: "hide",
  });

  event.target.classList.add("removed");

  STEP_1.classList.add("disabled");
  STEP_2.setAttribute("class", "invisible");

  const constraints = {
    video: {
      facingMode: "environment",
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
    },
  };

  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    VIDEO.srcObject = stream;

    VIDEO.addEventListener("loadeddata", function () {
      recalculateVideoScale();

      setTimeout(function () {
        STEP_2.setAttribute("class", "");
      }, ANIMATION_TIME);

      predictWebcam();
    });
  });
}

function renderFoundObject(prediction) {
  const p = document.createElement("p");
  p.innerText =
    prediction.class +
    " - with " +
    Math.round(parseFloat(prediction.score) * 100) +
    "% confidence.";

  p.style =
    "left: " +
    prediction.bbox[0] * ratioX +
    "px;" +
    "top: " +
    prediction.bbox[1] * ratioY +
    "px;" +
    "width: " +
    (prediction.bbox[2] * ratioX - 10) +
    "px;";

  const highlighter = document.createElement("div");
  highlighter.setAttribute("class", "highlighter");
  highlighter.style =
    "left: " +
    prediction.bbox[0] * ratioX +
    "px; top: " +
    prediction.bbox[1] * ratioY +
    "px; width: " +
    prediction.bbox[2] * ratioX +
    "px; height: " +
    prediction.bbox[3] * ratioY +
    "px;";

  LIVE_VIEW.appendChild(highlighter);
  LIVE_VIEW.appendChild(p);

  children.push(highlighter);
  children.push(p);
}

function predictWebcam() {
  model.detect(VIDEO).then(function (predictions) {
    for (let i = 0; i < children.length; i++) {
      LIVE_VIEW.removeChild(children[i]);
    }

    children.splice(0);
    foundMonitoredObjects.splice(0);

    for (let n = 0; n < predictions.length; n++) {
      if (predictions[n].score > MIN_DETECTION_CONFIDENCE) {
        if (state === "searching") {
          renderFoundObject(predictions[n]);

          if (predictions[n].class === CHOSEN_ITEM.value) {
            state = "monitoring";

            STEP_1.classList.remove("grayscale");
            STEP_1.classList.remove("disabled");
            STEP_3.classList.add("invisible");
            MONITORING_TEXT.setAttribute("class", "");
            setTimeout(function () {
              STEP_3.setAttribute("class", "removed");
              STEP_2.setAttribute("class", "removed");
            }, ANIMATION_TIME);
          }
        } else if (state === "monitoring") {
          if (predictions[n].class === CHOSEN_ITEM.value) {
            renderFoundObject(predictions[n]);
            foundMonitoredObjects.push(predictions[n]);
            huntForPets(predictions[n], predictions, CHOSEN_PET.value);

            break;
          }
        }
      }
    }

    window.requestAnimationFrame(predictWebcam);
  });
}

class BBox {
  constructor(bbox) {
    let x = bbox[0];
    let y = bbox[1];
    this.width = bbox[2];
    this.height = bbox[3];
    this.midX = x + this.width / 2;
    this.midY = y + this.height / 2;
  }

  distance(bbox) {
    let xDiff =
      Math.abs(this.midX - bbox.midX) - this.width / 2 - bbox.width / 2;
    let yDiff =
      Math.abs(this.midY - bbox.midY) - this.height / 2 - bbox.height / 2;

    if (xDiff < 0) {
      return Math.max(yDiff, 0);
    }

    if (yDiff < 0) {
      return xDiff;
    }

    return Math.sqrt(xDiff ** 2 + yDiff ** 2);
  }
}

function checkIfNear(item1, item2, distance = 0) {
  const BOUNDING_BOX_1 = new BBox(item1.bbox);
  const BOUNDING_BOX_2 = new BBox(item2.bbox);
  return BOUNDING_BOX_1.distance(BOUNDING_BOX_2) <= distance;
}

function cooldown() {
  sendAlerts = true;
}

function sendAlert(naughtyAnimals) {
  var detectionEvent = {};

  detectionEvent.dateTime = Date.now();

  detectionEvent.eventData = [];

  for (let i = 0; i < foundMonitoredObjects.length; i++) {
    var event = {};

    event.eventType = foundMonitoredObjects[i].class + "_" + CHOSEN_ITEM.value;

    event.score = foundMonitoredObjects[i].score;

    event.x1 = foundMonitoredObjects[i].bbox[0] / VIDEO.videoWidth;
    event.y1 = foundMonitoredObjects[i].bbox[1] / VIDEO.videoHeight;
    event.width = foundMonitoredObjects[i].bbox[2] / VIDEO.videoWidth;
    event.height = foundMonitoredObjects[i].bbox[3] / VIDEO.videoHeight;

    event.detections = [];

    for (let n = 0; n < naughtyAnimals.length; n++) {
      let animal = {};

      animal.objectType = naughtyAnimals[n].class;

      animal.score = naughtyAnimals[n].score;

      animal.x1 = naughtyAnimals[n].bbox[0] / VIDEO.videoWidth;
      animal.y1 = naughtyAnimals[n].bbox[1] / VIDEO.videoHeight;
      animal.width = naughtyAnimals[n].bbox[2] / VIDEO.videoWidth;
      animal.height = naughtyAnimals[n].bbox[3] / VIDEO.videoHeight;

      event.detections.push(animal);
    }

    detectionEvent.eventData.push(event);
  }

  CTX.drawImage(VIDEO, 0, 0);

  CANVAS.toBlob(function (blob) {
    detectionEvent.img = blob;

    console.log(detectionEvent);
  }, "image/png");
}

function huntForPets(monitoredItem, detectionArray, target) {
  var naughtyAnimals = [];

  for (let i = 0; i < detectionArray.length; i++) {
    if (
      detectionArray[i].class === target &&
      detectionArray[i].score > MIN_DETECTION_CONFIDENCE
    ) {
      renderFoundObject(detectionArray[i]);
      if (checkIfNear(monitoredItem, detectionArray[i])) {
        naughtyAnimals.push(detectionArray[i]);
      }
    }
  }

  if (naughtyAnimals.length > lastNaughtyAnimalCount) {
    lastNaughtyAnimalCount = naughtyAnimals.length;

    if (sendAlerts) {
      sendAlerts = false;
      sendAlert(naughtyAnimals);
      setTimeout(cooldown, MIN_ALERT_COOLDOWN_TIME * 1000);
    }
  } else if (naughtyAnimals.length === 0) {
    lastNaughtyAnimalCount = 0;
  }
}

function recalculateVideoScale() {
  ratioY = VIDEO.clientHeight / VIDEO.videoHeight;
  ratioX = VIDEO.clientWidth / VIDEO.videoWidth;
  CANVAS.width = VIDEO.videoWidth;
  CANVAS.height = VIDEO.videoHeight;
}

function enableDetection() {
  CHOSEN_ITEM_GUI.innerText = CHOSEN_ITEM.value;
  STEP_1.classList.add("grayscale");
  STEP_2.setAttribute("class", "invisible");
  STEP_3.setAttribute("class", "invisible");
  setTimeout(function () {
    STEP_3.setAttribute("class", "");
    state = "searching";
  }, ANIMATION_TIME);
}

window.addEventListener("resize", recalculateVideoScale);
ENABLE_DETECTION_BTN.addEventListener("click", enableDetection);
