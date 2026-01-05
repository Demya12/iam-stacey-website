// host.js
// Tabs: Videos | Shorts | Live | Podcasts
// Loads ALL items (no fixed limit) using pagination.
//
// Shorts:
// - Always includes a specific Shorts videoId you provided.
// - If you create a Shorts playlist, set PLAYLISTS.shorts (recommended).
// - Otherwise it falls back to filtering uploads by duration <= 60s (can be quota-heavy).

const API_KEY = "AIzaSyCmeIa2NRdTeTxyKGaPiZuabqxFrWJhw68";
const CHANNEL_ID = "UCxT4KEvB-D_i6iSfDXO8mzg";

// Playlists
const PLAYLISTS = {
  shorts: "", // optional: put a Shorts playlist ID here if you create one
  podcasts: "PLjFW00s_rQIp9gNuX74hlYvP37yy2b3tq",
};

// This Short must ALWAYS show under Shorts tab
const PINNED_SHORT_VIDEO_ID = "0zbMy6u50cQ";

// YouTube API page size limits
const PLAYLIST_PAGE_SIZE = 50; // max 50
const SEARCH_PAGE_SIZE = 50;   // max 50

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("videoGrid");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function hasRealPlaylistId(value) {
  return Boolean(value && value.length > 10 && !value.includes("PUT_"));
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

// ISO 8601 duration (PT#H#M#S) -> seconds
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
   YouTube API: uploads + playlists
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

async function getAllVideosFromPlaylist(playlistId) {
  let all = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet,contentDetails` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      `&maxResults=${PLAYLIST_PAGE_SIZE}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${encodeURIComponent(API_KEY)}`;

    const data = await fetchJson(url);

    const batch = (data.items || [])
      .map((item) => {
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

// videos.list for duration/snippet (up to 50 IDs per request)
async function getVideoDetailsBatch(videoIds) {
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
   YouTube API: live (search)
-------------------------------- */

// eventType: "live" | "upcoming" | "completed"
async function getAllLiveVideos(eventType = "live") {
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
      `&maxResults=${SEARCH_PAGE_SIZE}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${encodeURIComponent(API_KEY)}`;

    const data = await fetchJson(url);

    const batch = (data.items || [])
      .map((item) => {
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

/* -----------------------------
   Render
-------------------------------- */

function renderVideos(videos) {
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
   Tab loaders
-------------------------------- */

async function loadVideosTab() {
  setStatus("Loading videos...");
  const uploads = await getUploadsPlaylistId();
  const videos = await getAllVideosFromPlaylist(uploads);
  renderVideos(videos);
}

async function loadPodcastsTab() {
  if (!hasRealPlaylistId(PLAYLISTS.podcasts)) {
    setStatus("Podcasts playlist not set.");
    gridEl.innerHTML = "";
    return;
  }

  setStatus("Loading podcasts...");
  const pods = await getAllVideosFromPlaylist(PLAYLISTS.podcasts);
  renderVideos(pods);
}

async function loadLiveTab() {
  setStatus("Loading live...");
  const liveNow = await getAllLiveVideos("live");

  if (liveNow.length) {
    renderVideos(liveNow);
    return;
  }

  setStatus("No live right now — loading past live streams...");
  const completed = await getAllLiveVideos("completed");
  renderVideos(completed);
}

async function loadShortsTab() {
  // Preferred: Shorts playlist (if you create one)
  if (hasRealPlaylistId(PLAYLISTS.shorts)) {
    setStatus("Loading shorts...");
    const shorts = await getAllVideosFromPlaylist(PLAYLISTS.shorts);

    // Ensure pinned short is included
    const hasPinned = shorts.some(v => v.videoId === PINNED_SHORT_VIDEO_ID);
    if (!hasPinned) {
      shorts.unshift({
        videoId: PINNED_SHORT_VIDEO_ID,
        title: "Short",
        publishedAt: "",
      });
    }

    renderVideos(shorts);
    return;
  }

  // Fallback: filter uploads by duration <= 60s (can be quota-heavy if lots of uploads)
  setStatus("Loading shorts (this may take a moment)...");
  const uploads = await getUploadsPlaylistId();
  const uploadsAll = await getAllVideosFromPlaylist(uploads);

  // Batch details calls (50 IDs per request)
  const shorts = [];
  for (let i = 0; i < uploadsAll.length; i += 50) {
    const chunk = uploadsAll.slice(i, i + 50);
    const ids = chunk.map(v => v.videoId);

    setStatus(`Checking shorts... (${Math.min(i + 50, uploadsAll.length)}/${uploadsAll.length})`);

    const details = await getVideoDetailsBatch(ids);

    details.forEach(d => {
      const seconds = isoDurationToSeconds(d.duration);
      if (seconds > 0 && seconds <= 60) {
        shorts.push({
          videoId: d.videoId,
          title: d.title,
          publishedAt: d.publishedAt,
        });
      }
    });
  }

  // Ensure pinned short is included
  const hasPinned = shorts.some(v => v.videoId === PINNED_SHORT_VIDEO






