// Live read-endpoint hardening harness. NOT committed logic — a test driver.
// Drives the real compiled live client against every GET route.
import { loadApiMapRoutes } from "../dist/lib.js";
import { executeLiveRequest } from "../dist/client/live.js";

const USER_ID = "179929687";
const USER_SLUG = "179929687-zayd-khan";

// Known-good public/path-param values harvested from live pages.
const PARAMS = {
  author_slug: "1077326.J_K_Rowling",
  award_slug: "100-world-fantasy-award",
  book_slug: "3.Harry_Potter_and_the_Sorcerer_s_Stone",
  work_slug: "4640799-harry-potter-and-the-philosopher-s-stone",
  work_id: "4640799",
  user_slug: USER_SLUG,
  user_id: USER_ID,
  user: USER_ID,
  genre_slug: "fiction",
  group_slug: "1103665-booktok-x1f4da",
  interview_slug: "1-cassandra-clare",
  list_id: "1.Best_Books_Ever",
  folder: "sent",
  message_id: "492489841",
  question_slug: "1-do-you-have-any-advice-for-aspiring-writers",
  quote_slug: "10123-you-ve-gotta-dance-like-there-s-nobody-watching-love-like-you-ll",
  shelf_slug: "read",
  year: "2024",
  month: "1",
};

// Query params required by some read routes to be meaningful.
const QUERY = {
  "get_search-search": { q: "harry potter" },
  "get_genres-search": { q: "fantasy" },
};

const routes = (await loadApiMapRoutes()).filter((r) => r.method === "GET" && !r.mutatesAccount);
const results = [];

for (const route of routes) {
  const pathParams = {};
  let missing = null;
  for (const p of route.parameters.filter((p) => p.in === "path")) {
    const v = PARAMS[p.name] ?? PARAMS[p.name.replace(/-/g, "_")];
    if (v === undefined) { missing = p.name; break; }
    pathParams[p.name] = v;
  }
  if (missing) {
    results.push({ id: route.id, path: route.path, status: "SKIP", note: `no value for param ${missing}` });
    continue;
  }
  try {
    const out = await executeLiveRequest(route, {
      pathParams,
      query: QUERY[route.id] ?? {},
      dryRun: false,
    });
    results.push({ id: route.id, path: route.path, status: out.status, shape: out.bodyShape, bytes: out.byteLength });
  } catch (e) {
    results.push({ id: route.id, path: route.path, status: "ERR", note: String(e.message ?? e) });
  }
  await new Promise((r) => setTimeout(r, 350)); // be polite to Goodreads
}

let ok = 0, fail = 0, skip = 0;
for (const r of results) {
  const tag = r.status === 200 ? "OK " : (r.status === "SKIP" ? "SKP" : "!! ");
  if (r.status === 200) ok++; else if (r.status === "SKIP") skip++; else fail++;
  console.log(`${tag} ${String(r.status).padEnd(5)} ${r.path.padEnd(42)} ${r.shape ?? ""} ${r.bytes ?? ""} ${r.note ?? ""}`);
}
console.log(`\nTOTAL ${results.length}  OK ${ok}  FAIL ${fail}  SKIP ${skip}`);
