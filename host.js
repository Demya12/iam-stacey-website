// host.js
// Host tabs: Videos | Shorts | Live | Podcasts
// FIX: Videos tab now loads ALL uploads (pagination) so you can see all ~34+ videos.
//
// Required in host.html:
// - .tab-btn buttons with data-tab="videos|shorts|live|podcasts"
// - #status element
// - #videoGrid element

const API_KEY = "AIzaSyCmeIa2NRdTeTxyKGaPiZuabqxFrWJhw68";
const CHANNEL_ID = "UCxT4KEvB-D_i6iSfDXO8mzg";

// Optional: If you make a Shorts playlist later, paste its playlist ID here (PLxxxx...)
const PLAYLISTS = {
  shorts: "",
  // Podcasts playlist ID you provided:
  podcasts: "PLjFW00s_rQIp9gNuX74hlYvP37yy2b3tq",
};

// If Shorts playlist is not set, Shorts tab will filter uploads by duration <= 60 seconds
const SHORTS_FALLBACK_SCAN_LIMIT = 200; // set high to catch all shorts; 0 = scan all uploads

// (Optional) Always include this specific Short under Shorts tab:
const PINNED_SHORT_VIDEO_ID = "0zbMy6u50cQ";

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("videoGrid");

/* -------------------------
   Helpers
-------------------------- */

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function isoDurationToSeconds(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

/* -------------------------
   YouTube API: uploads + playlists
-------------------------- */

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

// ✅ Pagination: loads ALL videos from a playlist (not capped)
async function getAllVideosFromPlaylist(playlistId) {
  let all = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet,contentDetails` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      `&maxResults=50` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${encodeURIComponent(API_KEY)}`;

    const data = await fetchJson(url);

    const batch = (data.items || [])
      .map(item => {
        const videoId = item?.contentDetails?.videoId;
        const title = item?.snippet?.title || "Untitled";
        const publishedAt =
          item?.contentDetails?.videoPublishedAt || item?.snippet?.publishedAt;
        if (!videoId) return null;
        return { videoId, title, publishedAt };
      })
      .filter(Boolean);

    all = all.concat(batch);
    setStatus(`Loaded ${all.length}...`);

    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }

  return all;
}

// videos.list supports up to 50 IDs per call (used for Shorts fallback)
async function getVideoDetailsBatch(videoIds) {
  if (!videoIds.length) return [];

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=contentDetails,snippet` +
    `&id=${encodeURIComponent(videoIds.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  return (data.items || []).map(v => ({
    videoId: v?.id,
    title: v?.snippet?.title || "Untitled",
    publishedAt: v?.snippet?.publishedAt,
    duration: v?.contentDetails?.duration,
  }));
}

/* -------------------------
   YouTube API: live (search)
-------------------------- */

async function getLiveVideos(eventType = "live") {
  // eventType: "live" | "upcoming" | "completed"
  let all = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${encodeURIComponent(CHANNEL_ID)}` +
      `&eventType=${encodeURIComponent(eventType)}` +
      `&type=video` +
      `&order=date` +
      `&maxResults=50` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${encodeURIComponent(API_KEY)}`;

    const data = await fetchJson(url);

    const batch = (data.items || [])
      .map(item => {
        const videoId = item?.id?.videoId;
        const title = item?.snippet?.title || "Untitled";
        const publishedAt = item?.snippet?.publishedAt;
        if (!videoId) return null;
        return { videoId, title, publishedAt };
      })
      .filter(Boolean);

    all = all.concat(batch);
    setStatus(`Loaded ${all.length}...`);

    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }

  return all;
}

/* -------------------------
   Render
-------------------------- */

function renderVideos(videos) {
  if (!gridEl) return;

  gridEl.innerHTML = "";

  if (!videos.length) {
    setStatus("Nothing found for this category yet.");
    return;
  }

  const fragment = document.createDocumentFragment();

  videos.forEach(v => {
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

/* -------------------------
   Tab loaders
-------------------------- */

async function loadVideosTab() {
  setStatus("Loading videos...");
  const uploads = await getUploadsPlaylistId();
  const videos = await getAllVideosFromPlaylist(uploads); // ✅ all uploads (34+)
  renderVideos(videos);
}

async function loadPodcastsTab() {
  if (!hasRealPlaylistId(PLAYLISTS.podcasts)) {
    setStatus("Podcasts playlist not set.");
    gridEl.innerHTML = "";
    return;
  }
  setStatus("Loading podcasts...");
  const pods = await getAllVideosFromPlaylist(PLAYLISTS.podcasts); // loads all in podcast playlist
  renderVideos(pods);
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

async function loadShortsTab() {
  // Preferred: Shorts playlist
  if (hasRealPlaylistId(PLAYLISTS.shorts)) {
    setStatus("Loading shorts...");
    const shorts = await getAllVideosFromPlaylist(PLAYLISTS.shorts);

    // Ensure pinned short appears
    if (PINNED_SHORT_VIDEO_ID && !shorts.some(v => v.videoId === PINNED_SHORT_VIDEO_ID)) {
      shorts.unshift({ videoId: PINNED_SHORT_VIDEO_ID, title: "Short", publishedAt: "" });
    }

    renderVideos(shorts);
    return;
  }

  // Fallback: scan uploads, get durations, keep <=60 seconds
  setStatus("Loading shorts (may take a moment)...");
  const uploads = await getUploadsPlaylistId();
  const uploadsAll = await getAllVideosFromPlaylist(uploads);

  const scanLimit = SHORTS_FALLBACK_SCAN_LIMIT > 0
    ? Math.min(SHORTS_FALLBACK_SCAN_LIMIT, uploadsAll.length)
    : uploadsAll.length;

  const idsToScan = uploadsAll.slice(0, scanLimit).map(v => v.videoId);

  const shorts = [];
  for (let i = 0; i < idsToScan.length; i += 50) {
    const chunk = idsToScan.slice(i, i + 50);
    setStatus(`Checking shorts... (${Math.min(i + 50, idsToScan.length)}/${idsToScan.length})`);

    const details = await getVideoDetailsBatch(chunk);
    details.forEach(d => {
      const seconds = isoDurationToSeconds(d.duration);
      if (seconds > 0 && seconds <= 60) {
        shorts.push({ videoId: d.videoId, title: d.title, publishedAt: d.publishedAt });
      }
    });
  }

  // Ensure pinned short appears
  if (PINNED_SHORT_VIDEO_ID && !shorts.some(v => v.videoId === PINNED_SHORT_VIDEO_ID)) {
    shorts.unshift({ videoId: PINNED_SHORT_VIDEO_ID, title: "Short", publishedAt: "" });
  }

  renderVideos(shorts);
}

/* -------------------------
   Tabs wiring
-------------------------- */

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
    setStatus("Could not load. Check API key restrictions + YouTube Data API enabled.");
  }
}

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => {
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
  loadTab("videos"); // default
}

init();








