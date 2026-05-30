// ⚙️ Troque pela sua URL do Render após o deploy
const SERVER_URL = "https://SEU-APP.onrender.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
  console.log("[BG] Extensão Sortenabet iniciada — servidor:", SERVER_URL);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    console.log("[BG] Alive");
    // Mantém o servidor Render acordado
    fetch(SERVER_URL + "/api/status").catch(() => {});
  }
});
