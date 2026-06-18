// Phase B pure logic: plan/review parsing, scope matching, big-job detection.
//   npx tsx scripts/test-job-planning.mts
import { parsePlan, parseReview } from "../src/lib/jobs/parse.js";
import { pathInScope } from "../src/lib/jobs/scope.js";
import { looksLikeBigJob } from "../src/lib/jobs/detect.js";
import { estimateJob, formatEstimate } from "../src/lib/jobs/estimate.js";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { c ? (pass++, console.log("  PASS", l)) : (fail++, console.log("  FAIL", l)); };

// parsePlan
{
  const p = parsePlan('prose before [{"title":"A","scope":["app/**"],"instruction":"do a","acceptance":"a ok"},{"title":"B","instruction":"do b"}] trailing');
  ok(p.length === 2, "parsePlan: extracts array amid prose");
  ok(p[0].title === "A" && p[0].scope[0] === "app/**", "parsePlan: keeps title + scope");
  ok(p[1].scope.length === 0, "parsePlan: missing scope → []");
  ok(parsePlan("no json here").length === 0, "parsePlan: junk → []");
  ok(parsePlan('[{"title":"x"}]').length === 0, "parsePlan: drops task with no instruction");
}

// parseReview
{
  ok(parseReview('{"ship":true,"summary":"good"}').ship === true, "parseReview: ship:true");
  const r = parseReview('{"ship":false,"fixes":[{"title":"f","scope":["x.ts"],"instruction":"fix it"}]}');
  ok(r.ship === false && r.fixes.length === 1, "parseReview: rework with a fix");
  ok(parseReview("garbage").ship === true, "parseReview: unparseable → ship (no infinite loop)");
  ok(parseReview('{"ship":true,"fixes":[{"instruction":"still broken"}]}').ship === false, "parseReview: fixes present overrides ship");
}

// scope
{
  ok(pathInScope("app/page.tsx", ["app/**"]) === true, "scope: app/** matches app/page.tsx");
  ok(pathInScope("app/(app)/dashboard/page.tsx", ["app/**"]) === true, "scope: ** spans depth");
  ok(pathInScope("lib/util.ts", ["app/**"]) === false, "scope: out-of-scope rejected");
  ok(pathInScope("style.css", ["*.css"]) === true, "scope: *.css matches root css");
  ok(pathInScope("a/b.css", ["*.css"]) === false, "scope: * is single-segment");
  ok(pathInScope("anything", []) === true, "scope: empty scope = whole project");
  ok(pathInScope("lib/x.ts", ["app/**", "lib/x.ts"]) === true, "scope: exact path in list");
}

// detect
{
  ok(looksLikeBigJob("refactor the routes") === true, "detect: 'refactor' → big");
  ok(looksLikeBigJob("convert this into a marketplace") === true, "detect: 'convert' → big");
  ok(looksLikeBigJob("change the button color") === false, "detect: small change → not big");
  ok(looksLikeBigJob("update every page to use the new header") === true, "detect: 'every page' → big");
}

// estimate
{
  const small = estimateJob("add a contact page", 10);
  const big = estimateJob("refactor every page and restructure all the routes across the app", 80);
  ok(big.workersHigh >= small.workersHigh, "estimate: broad request → more workers");
  ok(big.tokensHigh > small.tokensHigh, "estimate: broad request → more tokens");
  ok(small.workersLow >= 2, "estimate: at least 2 workers");
  ok(/worker/.test(formatEstimate(small)) && /token/.test(formatEstimate(small)), "estimate: formats workers + tokens");
  // size-gate: recommend a JOB only for structural request AND a big project
  ok(estimateJob("refactor every page and route", 40).recommend === true, "recommend: big structural project → job");
  ok(estimateJob("refactor every page and route", 4).recommend === false, "recommend: tiny project → NO job (just build)");
  ok(estimateJob("add a contact form", 80).recommend === false, "recommend: non-structural request → NO job");
}

console.log(`\n=== job planning: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
