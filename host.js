// host.js
// Supports tabs: Videos | Shorts | Live | Podcasts
//
// Requirements in host.html:
// - Buttons with class ".tab-btn" and data-tab="videos|shorts|live|podcasts"
// - A status element with id="status"
// - A grid element with id="videoGrid"
//
// Notes:
// - Videos: latest uploads
// - Shorts: best = Shorts playlist ID; fallback = uploads filtered by duration <= 60s
// - Live: shows live now; if none, shows completed live streams
// - Podcasts: pulls from the Podcasts playlist you provided

const API_KEY = "AIzaSyCmeIa2NRdTeTxyKGaPiZuabqxFrWJhw68";
const CHANNEL_ID = "UCxT4KEvB-D_i6iSfDXO8mzg";

// How many items to show per tab
const MAX_RESULTS = 12;

// If no Shorts playlist ID is set, scan this many recent uploads to find Shorts (<= 60s)
// (max 50 per YouTube API request)
const SHORTS_FALLBACK_SCAN_LIMIT = 30;

// Playlist IDs
const PLAYLISTS = {
  // Shorts playlist is optional. Leave "" to use the duration<=60s fallback.
  shorts: "",
  // Podcasts playlist ID (from your link)
  podcasts: "PLjFW00s_rQIp9gNuX74hlYvP37yy2b3tq",
};

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("videoGrid");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const data = JSON.parse(text);
      const apiMsg = data?.error?.message;
      if (apiMsg) message += ` ${apiMsg}`;
    } catch (_) {}
    throw new Error(message);
  }

  return JSON.parse(text);
}

function hasRealPlaylistId(value) {
  return Boolean(value && value.length > 10 && !value.includes("PUT_"));
}

// Convert ISO 8601 duration "PT1M2S" -> seconds
function isoDurationToSeconds(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

/* -----------------------------
   YouTube: uploads + playlists
-------------------------------- */

async function getUploadsPlaylistId() {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${encodeURIComponent(CHANNEL_ID)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  const uploads = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("Could not find uploads playlist for this channel.");
  return uploads;
}

async function getVideosFromPlaylist(playlistId, maxResults = MAX_RESULTS) {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet,contentDetails` +
    `&playlistId=${encodeURIComponent(playlistId)}` +
    `&maxResults=${encodeURIComponent(maxResults)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  return (data.items || [])
    .map((item) => {
      const videoId = item?.contentDetails?.videoId;
      const title = item?.snippet?.title || "Untitled";
      const publishedAt =
        item?.contentDetails?.videoPublishedAt || item?.snippet?.publishedAt;

      if (!videoId) return null;
      return { videoId, title, publishedAt };
    })
    .filter(Boolean);
}

// Get durations for a list of video IDs (videos.list supports up to 50 IDs)
async function getVideoDetails(videoIds) {
  if (!videoIds.length) return [];

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=contentDetails,snippet` +
    `&id=${encodeURIComponent(videoIds.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  return (data.items || []).map((v) => ({
    videoId: v?.id,
    title: v?.snippet?.title || "Untitled",
    publishedAt: v?.snippet?.publishedAt,
    duration: v?.contentDetails?.duration,
  }));
}

/* -----------------------------
   YouTube: Live (search)
-------------------------------- */

// eventType: "live" | "upcoming" | "completed"
async function getLiveVideos(eventType = "live") {
  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&channelId=${encodeURIComponent(CHANNEL_ID)}` +
    `&eventType=${encodeURIComponent(eventType)}` +
    `&type=video` +
    `&order=date` +
    `&maxResults=${encodeURIComponent(MAX_RESULTS)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  return (data.items || [])
    .map((item) => {
      const videoId = item?.id?.videoId;
      const title = item?.snippet?.title || "Untitled";
      const publishedAt = item?.snippet?.publishedAt;
      if (!videoId) return null;
      return { videoId, title, publishedAt };
    })
    .filter(Boolean);
}

/* -----------------------------
   Render
-------------------------------- */

function renderVideos(videos) {
  if (!gridEl) return;

  gridEl.innerHTML = "";

  if (!videos.length) {
    setStatus("Nothing found for this category yet.");
    return;
  }

  const fragment = document.createDocumentFragment();

  videos.forEach((v) => {
    const card = document.createElement("article");
    card.className = "video-card";

    const iframe = document.createElement("iframe");
    iframe.className = "video-frame";
    iframe.src = `https://www.youtube.com/embed/${v.videoId}`;
    iframe.title = v.title;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "video-meta";

    const h3 = document.createElement("h3");
    h3.className = "video-title";
    h3.textContent = v.title;

    const p = document.createElement("p");
    p.className = "video-date";
    p.textContent = formatDate(v.publishedAt);

    meta.appendChild(h3);
    meta.appendChild(p);

    card.appendChild(iframe);
    card.appendChild(meta);

    fragment.appendChild(card);
  });

  gridEl.appendChild(fragment);
  setStatus("");
}

/* -----------------------------
   Load each tab
-------------------------------- */

async function loadVideosTab() {
  setStatus("Loading videos...");
  const uploads = await getUploadsPlaylistId();
  const videos = await getVideosFromPlaylist(uploads, MAX_RESULTS);
  renderVideos(videos);
}

async function loadShortsTab() {
  // Preferred: Shorts playlist (if you create one and paste ID)
  if (hasRealPlaylistId(PLAYLISTS.shorts)) {
    setStatus("Loading shorts...");
    const shorts = await getVideosFromPlaylist(PLAYLISTS.shorts, MAX_RESULTS);
    renderVideos(shorts);
    return;
  }

  // Fallback: filter recent uploads by duration <= 60 seconds
  setStatus("Loading shorts...");
  const uploads = await getUploadsPlaylistId();

  const scanCount = Math.min(50, SHORTS_FALLBACK_SCAN_LIMIT);
  const recentUploads = await getVideosFromPlaylist(uploads, scanCount);
  const ids = recentUploads.map((v) => v.videoId);

  const details = await getVideoDetails(ids);

  const shorts = details
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      publishedAt: v.publishedAt,
      seconds: isoDurationToSeconds(v.duration),
    }))
    .filter((v) => v.seconds > 0 && v.seconds <= 60)
    .slice(0, MAX_RESULTS)
    .map(({ videoId, title, publishedAt }) => ({ videoId, title, publishedAt }));

  renderVideos(shorts);
}

async function loadLiveTab() {
  setStatus("Loading live...");
  const liveNow = await getLiveVideos("live");

  if (liveNow.length) {
    renderVideos(liveNow);
    return;
  }

  setStatus("No live right now — loading past live streams...");
  const completed = await getLiveVideos("completed");
  renderVideos(completed);
}

async function loadPodcastsTab() {
  if (!hasRealPlaylistId(PLAYLISTS.podcasts)) {
    setStatus("Podcasts playlist not set yet.");
    gridEl.innerHTML = "";
    return;
  }

  setStatus("Loading podcasts...");
  const pods = await getVideosFromPlaylist(PLAYLISTS.podcasts, MAX_RESULTS);
  renderVideos(pods);
}

/* -----------------------------
   Tab wiring
-------------------------------- */

// Prevent old requests from overwriting if user clicks fast
let loadToken = 0;

async function loadTab(tabName) {
  const myToken = ++loadToken;

  try {
    if (!gridEl) return;
    gridEl.innerHTML = "";

    if (tabName === "videos") await loadVideosTab();
    else if (tabName === "shorts") await loadShortsTab();
    else if (tabName === "live") await loadLiveTab();
    else if (tabName === "podcasts") await loadPodcastsTab();
    else setStatus("Unknown tab.");

    if (myToken !== loadToken) return;
  } catch (err) {
    console.error(err);
    if (myToken !== loadToken) return;

    setStatus(
      "Could not load. Check: YouTube Data API enabled + API key restrictions + allowed referrers."
    );
  }
}

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // active state + aria
      buttons.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      loadTab(btn.dataset.tab);
    });
  });
}

function init() {
  initTabs();
  loadTab("videos"); // default tab
}

init();





