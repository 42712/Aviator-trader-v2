chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
  console.log("[BG] Extensao Sortenabet iniciada");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    console.log("[BG] Alive");
  }
});

setInterval(() => {
  fetch("https://aviator-trader-1.onrender.com/api/status").catch(() => {});
}, 4 * 60 * 1000);
