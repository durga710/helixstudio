/** End-to-end classroom flow: instructor + student, assignment lifecycle,
 * grading, request-revision, resubmit, and the overview aggregation.
 * Usage: node scripts/test-classroom-flow.mjs [baseUrl] */
const BASE = process.argv[2] ?? "http://localhost:3000";
function jar() {
  let c = {};
  return {
    h: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; "),
    store: (r) => {
      for (const x of r.headers.getSetCookie?.() ?? []) {
        const [p] = x.split(";");
        const i = p.indexOf("=");
        c[p.slice(0, i).trim()] = p.slice(i + 1).trim();
      }
    },
  };
}
async function login(j, email, password) {
  let r = await fetch(`${BASE}/api/auth/csrf`);
  j.store(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: j.h(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  j.store(r);
}
const api = (j, path, opts = {}) =>
  fetch(`${BASE}${path}`, { ...opts, headers: { cookie: j.h(), "Content-Type": "application/json", ...(opts.headers ?? {}) } })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
let fail = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : `  ${extra}`}`);
  if (!cond) fail++;
};

const inst = jar();
await login(inst, "demo@helixstudio.org", "helix-demo");

// classroom
let r = await api(inst, "/api/spaces", { method: "POST", body: JSON.stringify({ name: "CS101", kind: "classroom" }) });
const space = r.json?.data;
check("created classroom", Boolean(space?.id), JSON.stringify(r.json));
const sid = space.id;

// assignment
r = await api(inst, `/api/spaces/${sid}/assignments`, {
  method: "POST",
  body: JSON.stringify({ title: "Build a TODO app", instructions: "Make it work.", dueAt: new Date(Date.now() + 3 * 864e5).toISOString() }),
});
check("created assignment", r.status === 200 && r.json?.ok, JSON.stringify(r.json));
r = await api(inst, `/api/spaces/${sid}/assignments`);
const aid = r.json?.data?.assignments?.[0]?.id;
check("assignment listed", Boolean(aid), JSON.stringify(r.json?.data));

// student joins
const stu = jar();
const email = `cs101_${Date.now()}@ex.com`;
await api(stu, "/api/auth/signup", { method: "POST", body: JSON.stringify({ name: "Sam Student", email, password: "password1234" }) });
await login(stu, email, "password1234");
r = await api(stu, "/api/spaces/join", { method: "POST", body: JSON.stringify({ code: space.joinCode }) });
check("student joined", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

// student starts + submits
r = await api(stu, `/api/spaces/${sid}/assignments/${aid}/start`, { method: "POST" });
check("student started", r.status === 200 && r.json?.data?.workspaceId, JSON.stringify(r.json));
r = await api(stu, `/api/spaces/${sid}/assignments/${aid}/submit`, { method: "POST", body: JSON.stringify({ action: "submit" }) });
check("student submitted", r.json?.data?.status === "submitted", JSON.stringify(r.json));

// overview: 1 needs grading
r = await api(inst, `/api/spaces/${sid}/overview`);
check("overview: 1 needs grading", r.json?.data?.needsGrading === 1, JSON.stringify(r.json?.data));
check("overview: due soon counted", r.json?.data?.dueSoon === 1, JSON.stringify(r.json?.data));

// instructor grades + marks reviewed
r = await api(inst, `/api/spaces/${sid}/assignments/${aid}`);
const subId = r.json?.data?.roster?.[0]?.submissionId;
check("roster has submission", Boolean(subId), JSON.stringify(r.json?.data?.roster));
r = await api(inst, `/api/spaces/${sid}/assignments/${aid}/submissions/${subId}`, {
  method: "PATCH",
  body: JSON.stringify({ grade: "90/100", feedback: "Good, tighten the CSS.", markReviewed: true }),
});
check("graded + reviewed", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

// student sees feedback now
r = await api(stu, `/api/spaces/${sid}/assignments/${aid}`);
check("student sees grade after review", r.json?.data?.mine?.grade === "90/100", JSON.stringify(r.json?.data?.mine));

// overview: avg grade 90, completion 100
r = await api(inst, `/api/spaces/${sid}/overview`);
check("overview: avg grade 90", r.json?.data?.avgGrade === 90, JSON.stringify(r.json?.data));
check("overview: completion 100%", r.json?.data?.completionPct === 100, JSON.stringify(r.json?.data));
check("overview: needs grading back to 0", r.json?.data?.needsGrading === 0, JSON.stringify(r.json?.data));

// instructor requests revision
r = await api(inst, `/api/spaces/${sid}/assignments/${aid}/submissions/${subId}`, {
  method: "PATCH",
  body: JSON.stringify({ requestRevision: true }),
});
check("requested revision", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

// student still sees feedback during revise + can resubmit
r = await api(stu, `/api/spaces/${sid}/assignments/${aid}`);
check("student status = revise", r.json?.data?.mine?.status === "revise", JSON.stringify(r.json?.data?.mine));
check("feedback still visible during revise", r.json?.data?.mine?.feedback?.includes("CSS"), JSON.stringify(r.json?.data?.mine));
r = await api(stu, `/api/spaces/${sid}/assignments/${aid}/submit`, { method: "POST", body: JSON.stringify({ action: "submit" }) });
check("student resubmitted from revise", r.json?.data?.status === "submitted", JSON.stringify(r.json));

// edit assignment
r = await api(inst, `/api/spaces/${sid}/assignments/${aid}`, {
  method: "PATCH",
  body: JSON.stringify({ title: "Build a TODO app (v2)" }),
});
check("edited assignment", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

// gradebook (for CSV source)
r = await api(inst, `/api/spaces/${sid}/gradebook`);
check("gradebook returns cells", Boolean(r.json?.data?.cells), JSON.stringify(Object.keys(r.json?.data ?? {})));

// delete assignment
r = await api(inst, `/api/spaces/${sid}/assignments/${aid}`, { method: "DELETE" });
check("deleted assignment", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

// cleanup
await api(inst, `/api/spaces/${sid}`, { method: "DELETE" });

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
