// host.js
// Pulls latest videos from a channel and embeds them in a 2-column grid.

const API_KEY = "AIzaSyCmeIa2NRdTeTxyKGaPiZuabqxFrWJhw68";
const CHANNEL_ID = "UCxT4KEvB-D_i6iSfDXO8mzg";

// Change how many videos show on the host page:
const MAX_RESULTS = 6;

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("videoGrid");

function setStatus(msg) {
  statusEl.textContent = msg || "";
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
    // Try to show YouTube API's error message if present
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

async function getUploadsPlaylistId() {
  // Step 1: get the channel's "uploads" playlist
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${encodeURIComponent(CHANNEL_ID)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  const uploads =
    data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error("Could not find uploads playlist for this channel.");
  }

  return uploads;
}

async function getLatestVideosFromUploads(uploadsPlaylistId) {
  // Step 2: list playlist items (videos) from uploads playlist
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet,contentDetails` +
    `&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
    `&maxResults=${encodeURIComponent(MAX_RESULTS)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  const videos = (data.items || [])
    .map(item => {
      const videoId = item?.contentDetails?.videoId;
      const title = item?.snippet?.title || "Untitled";
      const publishedAt = item?.contentDetails?.videoPublishedAt || item?.snippet?.publishedAt;

      if (!videoId) return null;

      return { videoId, title, publishedAt };
    })
    .filter(Boolean);

  return videos;
}

function renderVideos(videos) {
  gridEl.innerHTML = "";

  if (!videos.length) {
    setStatus("No videos found yet.");
    return;
  }

  const cards = videos.map(v => {
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

    return card;
  });

  cards.forEach(c => gridEl.appendChild(c));
  setStatus("");
}

async function init() {
  try {
    setStatus("Loading videos...");
    const uploadsPlaylistId = await getUploadsPlaylistId();
    const videos = await getLatestVideosFromUploads(uploadsPlaylistId);
    renderVideos(videos);
  } catch (err) {
    console.error(err);

    setStatus(
      "Could not load videos. Check your API key restrictions + YouTube Data API is enabled."
    );

    // Helpful debug message (optional):
    // setStatus(err.message);
  }
}

init();

