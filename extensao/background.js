const SERVER_URL = "https://aviator-trader.onrender.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
  console.log("[BG] Extensão Sortenabet iniciada — servidor:", SERVER_URL);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    console.log("[BG] Alive");
    fetch(SERVER_URL + "/api/status").catch(() => {});
  }
});
