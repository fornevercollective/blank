/**
 * Progressive album cover loading (VWall stream-load / media-ladder patterns).
 * Wave-mounts tiles, lazy-decodes covers when visible, optional full-res upgrade.
 */

const WAVE_SIZE = 6;
const WAVE_MS = 70;

/** @type {IntersectionObserver | null} */
let coverIo = null;

/** @returns {IntersectionObserver} */
function coverObserver() {
  if (coverIo) return coverIo;
  coverIo = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (!(img instanceof HTMLImageElement)) continue;
        const src = img.dataset.src;
        if (!src || img.dataset.loaded === "1") continue;
        img.dataset.loaded = "1";
        img.addEventListener(
          "load",
          () => {
            img.classList.remove("is-pending");
            img.closest(".live-concerts-album")?.classList.add("is-loaded");
            img.dispatchEvent(new CustomEvent("album-cover-loaded", { bubbles: true }));
          },
          { once: true },
        );
        img.addEventListener(
          "error",
          () => {
            img.classList.add("is-missing");
            img.classList.remove("is-pending");
            img.dispatchEvent(new CustomEvent("album-cover-loaded", { bubbles: true }));
          },
          { once: true },
        );
        img.src = src;
        coverIo?.unobserve(img);
      }
    },
    { root: null, rootMargin: "120px", threshold: 0.01 },
  );
  return coverIo;
}

/** @param {{ title: string, year?: number | null, coverUrl?: string, variantUrls?: { url: string, role?: string, maxEdge?: number }[] }} a */
export function previewCoverUrl(a) {
  const variants = Array.isArray(a.variantUrls) ? a.variantUrls : [];
  const preview = variants.find((v) => v.role === "preview") || variants[0];
  return preview?.url || a.coverUrl || "";
}

/** @param {{ variantUrls?: { url: string, role?: string }[] }} a */
export function fullCoverUrl(a) {
  const variants = Array.isArray(a.variantUrls) ? a.variantUrls : [];
  const full = variants.find((v) => v.role === "full");
  return full?.url || previewCoverUrl(a);
}

/**
 * @param {HTMLElement} scrollEl
 * @param {object[]} albums
 * @param {{ onProgress?: (loaded: number, total: number) => void, onTileClick?: (a: object, btn: HTMLButtonElement) => void }} [hooks]
 * @returns {() => void} cancel
 */
export function mountAlbumWall(scrollEl, albums, hooks = {}) {
  let cancelled = false;
  scrollEl.innerHTML = "";
  const total = albums.length;
  if (!total) return () => {};

  let loaded = 0;

  const report = () => hooks.onProgress?.(loaded, total);

  const mountOne = (a) => {
    if (cancelled) return;
    const year = a.year != null ? String(a.year) : "—";
    const preview = previewCoverUrl(a);
    const full = fullCoverUrl(a);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "live-concerts-album";
    btn.role = "listitem";
    btn.dataset.albumTitle = a.title || "";
    btn.dataset.albumYear = year;
    btn.title = `${a.title || ""} (${year})`;
    if (full && full !== preview) btn.dataset.fullCover = full;

    const img = document.createElement("img");
    img.className = "live-concerts-album-cover is-pending";
    img.alt = "";
    img.width = 72;
    img.height = 72;
    img.decoding = "async";
    if (preview) {
      img.dataset.src = preview;
      coverObserver().observe(img);
    } else {
      img.classList.add("is-missing");
      loaded += 1;
      report();
    }
    img.addEventListener("album-cover-loaded", () => {
      loaded += 1;
      report();
    });

    const yearEl = document.createElement("span");
    yearEl.className = "live-concerts-album-year";
    yearEl.textContent = year;
    const titleEl = document.createElement("span");
    titleEl.className = "live-concerts-album-title";
    titleEl.textContent = a.title || "";

    btn.append(img, yearEl, titleEl);
    btn.addEventListener("click", () => hooks.onTileClick?.(a));
    btn.addEventListener("mouseenter", () => {
      const hi = btn.dataset.fullCover;
      if (hi && img instanceof HTMLImageElement && img.src !== hi && img.dataset.loaded === "1") {
        img.src = hi;
      }
    });
    scrollEl.appendChild(btn);
    report();
  };

  const run = async () => {
    for (let i = 0; i < total; i += WAVE_SIZE) {
      if (cancelled) return;
      const chunk = albums.slice(i, i + WAVE_SIZE);
      for (const a of chunk) mountOne(a);
      if (i + WAVE_SIZE < total) await new Promise((r) => setTimeout(r, WAVE_MS));
    }
  };

  void run();

  return () => {
    cancelled = true;
    scrollEl.innerHTML = "";
  };
}

export function disposeAlbumWallLoader() {
  coverIo?.disconnect();
  coverIo = null;
}
