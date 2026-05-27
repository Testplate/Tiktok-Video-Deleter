(async () => {
  const DRY_RUN = false;
  const IGNORED_AWEME_IDS = new Set(["123"]);

  const MAX_DELETES = Infinity;
  const DELETE_DELAY_MS = 1;
  const SCROLL_DELAY_MS = 1;
  const MAX_EMPTY_SCROLLS = 1200;

  const seenAwemeIds = new Set();
  const processedAwemeIds = new Set();
  const results = [];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    for (const c of cookies) {
      const idx = c.indexOf("=");
      const key = idx > -1 ? c.slice(0, idx) : c;
      const val = idx > -1 ? c.slice(idx + 1) : "";
      if (key === name) return val;
    }
    return null;
  }

  function collectAwemeIdsFromPage() {
    const found = new Set();

    document.querySelectorAll('a[href*="/video/"]').forEach(a => {
      const href = a.getAttribute("href") || "";
      const match = href.match(/\/video\/(\d{10,25})/);
      if (match && !IGNORED_AWEME_IDS.has(match[1])) {
        found.add(match[1]);
      }
    });

    for (const match of document.documentElement.innerHTML.matchAll(/\/video\/(\d{10,25})/g)) {
      if (!IGNORED_AWEME_IDS.has(match[1])) {
        found.add(match[1]);
      }
    }

    const newIds = [];
    for (const id of found) {
      if (!seenAwemeIds.has(id) && !processedAwemeIds.has(id)) {
        seenAwemeIds.add(id);
        newIds.push(id);
      }
    }

    return newIds;
  }

  async function scrollForMoreVideos() {
    const beforeHeight = document.documentElement.scrollHeight;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    await sleep(SCROLL_DELAY_MS);

    const afterHeight = document.documentElement.scrollHeight;
    return afterHeight > beforeHeight;
  }

  async function deletePost(awemeId) {
    const url = new URL("https://www.tiktok.com/tiktok/post/edit/v1/");

    url.search = new URLSearchParams({
      locale: "en-GB",
      aid: "1988",
      priority_region: "GB",
      region: "KE",
      tz_name: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
      app_name: "tiktok_creator_center",
      app_language: navigator.language || "en-GB",
      device_platform: "web_mobile",
      channel: "tiktok_web",
      device_id: getCookie("ttwid") || "",
      os: navigator.platform || "iPhone",
      screen_width: String(window.screen.width || 1179),
      screen_height: String(window.screen.height || 2556),
      browser_language: navigator.language || "en-GB",
      browser_platform: navigator.platform || "iPhone",
      browser_name: "Mozilla",
      browser_version: navigator.userAgent
    });

    const body = {
      aweme_id: awemeId,
      scene: 1,
      delete: { delete_type: 1 }
    };

    const res = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Agw-Js-Conv": "str"
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      aweme_id: awemeId,
      status: res.status,
      ok: res.ok,
      response: data
    };
  }

  async function processId(id) {
    console.log("Processing:", id);

    try {
      const result = DRY_RUN
        ? { aweme_id: id, status: "DRY_RUN", ok: true, response: "No request sent." }
        : await deletePost(id);

      results.push(result);
      console.log(result);
    } catch (e) {
      results.push({
        aweme_id: id,
        ok: false,
        error: e.message || String(e)
      });
      console.error("Failed:", id, e);
    } finally {
      processedAwemeIds.add(id);
    }

    await sleep(DELETE_DELAY_MS);
  }

  console.log(DRY_RUN ? "DRY_RUN enabled — no delete requests will be sent." : "LIVE MODE — delete requests will be sent.");

  if (!DRY_RUN) {
    const confirmed = confirm(
      "This will keep scrolling and deleting TikTok posts until no new eligible videos load. Continue?"
    );
    if (!confirmed) return;
  }

  let emptyScrolls = 0;

  while (processedAwemeIds.size < MAX_DELETES) {
    const newIds = collectAwemeIdsFromPage();

    if (newIds.length) {
      emptyScrolls = 0;
      console.table(newIds.map((id, i) => ({
        batch_index: i + 1,
        aweme_id: id
      })));

      for (const id of newIds) {
        if (processedAwemeIds.size >= MAX_DELETES) break;
        await processId(id);
      }
    } else {
      emptyScrolls += 1;
      console.log(`No new eligible video IDs found. Empty scroll ${emptyScrolls}/${MAX_EMPTY_SCROLLS}.`);
    }

    if (emptyScrolls >= MAX_EMPTY_SCROLLS) {
      console.log("Stopping because repeated scrolling did not reveal any new eligible videos.");
      break;
    }

    await scrollForMoreVideos();
  }

  console.table(results.map(r => ({
    aweme_id: r.aweme_id,
    status: r.status || "ERR",
    ok: r.ok
  })));

  console.log("Done:", results);
})();
