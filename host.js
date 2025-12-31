// host.js
// Loads ALL videos from a YouTube channel using the uploads playlist + pagination,
// then renders them in your grid.

const API_KEY = "AIzaSyCmeIa2NRdTeTxyKGaPiZuabqxFrWJhw68";
const CHANNEL_ID = "UCxT4KEvB-D_i6iSfDXO8mzg";

// Set to a big number if you want to limit (ex: 100). Use Infinity for all.
const TOTAL_LIMIT = Infinity;

// YouTube API maxResults per request for playlistItems is 50
const PAGE_SIZE = 50;

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

async function getUploadsPlaylistId() {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${encodeURIComponent(CHANNEL_ID)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await fetchJson(url);

  const uploads = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error("Could not find uploads playlist for this channel.");
  }

  return uploads;
}

async function getAllVideosFromUploads(uploadsPlaylistId) {
  let all = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet,contentDetails` +
      `&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
      `&maxResults=${PAGE_SIZE}` +
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

    // Update status as it loads
    setStatus(`Loaded ${all.length} videos...`);

    // Respect TOTAL_LIMIT if you set one
    if (Number.isFinite(TOTAL_LIMIT) && all.length >= TOTAL_LIMIT) {
      return all.slice(0, TOTAL_LIMIT);
    }

    // If no nextPageToken, we’re done
    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }

  return all;
}

function renderVideos(videos) {
  if (!gridEl) return;

  gridEl.innerHTML = "";

  if (!videos.length) {
    setStatus("No videos found yet.");
    return;
  }

  // Optional: newest first (uploads playlist is usually already newest first)
  // videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

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

async function init() {
  try {
    setStatus("Loading videos...");

    const uploadsPlaylistId = await getUploadsPlaylistId();
    const videos = await getAllVideosFromUploads(uploadsPlaylistId);

    renderVideos(videos);
  } catch (err) {
    console.error(err);
    setStatus(
      "Could not load videos. Check: YouTube Data API enabled + API key restrictions + referrer URL."
    );
  }
}

init();



