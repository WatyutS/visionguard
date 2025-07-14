// ✅ script.js: เวอร์ชันสมบูรณ์ รองรับการตรวจจับหลับใน เหม่อลอย สูบบุหรี่ ใช้โทรศัพท์ เด็กรบกวน หลายใบหน้า พร้อมระบบคิวแจ้งเตือนแบบไม่ซ้อนกัน

let video = document.getElementById("webcam");
let camera = null;
let faceMesh = null;
let model;

let soundDrowsy = document.getElementById("sound-drowsy");
let soundDistracted = document.getElementById("sound-distracted");
let soundCigarette = document.getElementById("sound-cigarette");
let soundPhone = document.getElementById("sound-phone");
let soundChild = document.getElementById("sound-child");

let peakdow = 0;
const threshold = 8;
let distractCount = 0;
const distractThreshold = 8;
let countDrowsy = 0;
let countDistracted = 0;
let countCigarette = 0;
let countPhone = 0;
let countChild = 0;
let countMultiFace = 0;

let drowsyActive = false;
let distractActive = false;
let cigaretteActive = false;
let phoneActive = false;
let childActive = false;
let multiFaceActive = false;

let isAlertVisible = false;
let currentAlert = null;
let alertBox = null;
let alertQueue = [];
let isProcessingAlert = false;

const priorityOrder = ["drowsy", "phone", "cigarette", "distracted", "child", "multi_face"];

function queueAlert(message, sound, type) {
  alertQueue.push({ message, sound, type });
  processNextAlert();
}

async function processNextAlert() {
  if (isProcessingAlert || alertQueue.length === 0) return;
  isProcessingAlert = true;
  const { message, sound, type } = alertQueue.shift();
  alertBox = document.getElementById("alert-box");
  alertBox.innerText = message;
  alertBox.style.display = "block";
  if (sound) {
    sound.pause();
    sound.currentTime = 0;
    sound.play();
  }
  currentAlert = type;
  isAlertVisible = true;
  await new Promise(resolve => setTimeout(resolve, 3000));
  alertBox.style.display = "none";
  isAlertVisible = false;
  currentAlert = null;
  isProcessingAlert = false;
  processNextAlert();
}

function updateStats() {
  document.getElementById("count-drowsy").innerText = countDrowsy;
  document.getElementById("count-distracted").innerText = countDistracted;
  document.getElementById("count-Cigarette").innerText = countCigarette;
  document.getElementById("count-Phone").innerText = countPhone;
  document.getElementById("count-Child").innerText = countChild;
}

function calcEAR(p1, p2, p3, p4, p5, p6) {
  const vertical1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const vertical2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

function getEyeAspectRatio(landmarks) {
  const leftEAR = calcEAR(landmarks[33], landmarks[160], landmarks[158], landmarks[133], landmarks[153], landmarks[144]);
  const rightEAR = calcEAR(landmarks[362], landmarks[385], landmarks[387], landmarks[263], landmarks[373], landmarks[380]);
  return (leftEAR + rightEAR) / 2.0;
}

faceMesh = new FaceMesh({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 3,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(results => {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    peakdow = Math.max(0, peakdow - 1);
    distractCount = Math.max(0, distractCount - 1);
    multiFaceActive = false;
    return;
  }

  if (results.multiFaceLandmarks.length >= 2) {
    if (!multiFaceActive) {
      countMultiFace++;
      queueAlert("👥 พบใบหน้าหลายคนในกล้อง!", soundChild, "multi_face");
      multiFaceActive = true;
    }
    return;
  } else {
    multiFaceActive = false;
  }

  const landmarks = results.multiFaceLandmarks[0];
  const ear = getEyeAspectRatio(landmarks);
  peakdow = (ear < 0.2) ? peakdow + 1 : Math.max(0, peakdow - 1);

  const noseX = landmarks[1].x;
  const faceCenterX = (landmarks[33].x + landmarks[263].x) / 2;
  const deviation = Math.abs(noseX - faceCenterX);
  distractCount = (deviation > 0.08) ? distractCount + 1 : Math.max(0, distractCount - 1);

  drowsyActive = peakdow >= threshold;
  distractActive = distractCount >= distractThreshold;
  updateStats();
});

async function loadTFModel() {
  const url = "./model/";
  model = await tmImage.load(url + "model.json", url + "metadata.json");
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await video.play();

  camera = new Camera(video, {
    onFrame: async () => {
      if (faceMesh && video.readyState >= 2) {
        await faceMesh.send({ image: video });
      }

      if (!model) return;
      const prediction = await model.predict(video);
      const predictions = {};

      prediction.forEach(p => {
        predictions[p.className.toLowerCase()] = p.probability;
      });

      if (peakdow >= threshold) predictions["drowsy"] = 0.98;
      if (distractCount >= distractThreshold) predictions["distracted"] = 0.98;
      if (multiFaceActive) predictions["multi_face"] = 1.0;

      for (let label of priorityOrder) {
        const prob = predictions[label] || 0;
        const active = {
          drowsy: drowsyActive,
          distracted: distractActive,
          cigarette: cigaretteActive,
          phone: phoneActive,
          child: childActive,
          multi_face: multiFaceActive
        };

        if (prob > 0.99 && !active[label]) {
          switch (label) {
            case "drowsy":
              countDrowsy++;
              queueAlert("😴 ตรวจพบอาการหลับใน!", soundDrowsy, "drowsy");
              drowsyActive = true;
              break;
            case "phone":
              countPhone++;
              queueAlert("📱 ตรวจพบการใช้โทรศัพท์!", soundPhone, "phone");
              phoneActive = true;
              break;
            case "cigarette":
              countCigarette++;
              queueAlert("🚬 ตรวจพบการสูบบุหรี่!", soundCigarette, "cigarette");
              cigaretteActive = true;
              break;
            case "distracted":
              countDistracted++;
              queueAlert("😵 ตรวจพบอาการเหม่อลอย!", soundDistracted, "distracted");
              distractActive = true;
              break;
            case "child":
              countChild++;
              queueAlert("👶 เด็กเล็กรบกวน!", soundChild, "child");
              childActive = true;
              break;
          }
          break;
        }

        if (prob < 0.5) {
          if (label === "drowsy") drowsyActive = false;
          if (label === "phone") phoneActive = false;
          if (label === "cigarette") cigaretteActive = false;
          if (label === "distracted") distractActive = false;
          if (label === "child") childActive = false;
          if (label === "multi_face") multiFaceActive = false;
        }
      }

      updateStats();
    },
    width: 640,
    height: 480
  });

  camera.start();
}

function stopCamera() {
  if (camera) {
    camera.stop();
    camera = null;
  }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  peakdow = 0;
  distractCount = 0;
  hideAlert();
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadTFModel();
});
