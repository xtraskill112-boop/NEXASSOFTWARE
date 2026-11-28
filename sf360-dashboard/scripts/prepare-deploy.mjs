#!/usr/bin/env node
/**
 * Writes the deploy-time files that must not live in git:
 *   - firestore.rules     (from firestore.rules.template, with the allow-listed e-mails)
 *   - functions/.env      (ALLOWED_EMAILS and SHADOWFAX_ENV for Cloud Functions params)
 *   - .firebaserc         (project, and the Hosting site behind the "sf360" target)
 *
 * Usage:
 *   SF360_ALLOWED_EMAILS="you@example.com" SF360_SHADOWFAX_ENV=staging \
 *   SF360_FIREBASE_PROJECT_ID=my-project SF360_HOSTING_SITE=my-project-sf360 node scripts/prepare-deploy.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const emails = (process.env.SF360_ALLOWED_EMAILS ?? "")
  .split(/[,;\s]+/)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
if (!emails.length) {
  console.error("SF360_ALLOWED_EMAILS is empty. Set it to the e-mail address that may log in.");
  process.exit(1);
}
const bad = emails.filter((e) => !EMAIL.test(e));
if (bad.length) {
  console.error(`Not a valid e-mail address: ${bad.join(", ")}`);
  process.exit(1);
}

const env = (process.env.SF360_SHADOWFAX_ENV ?? "staging").trim().toLowerCase();
if (env !== "staging" && env !== "production") {
  console.error('SF360_SHADOWFAX_ENV must be "staging" or "production".');
  process.exit(1);
}

const project = (process.env.SF360_FIREBASE_PROJECT_ID ?? "").trim();
const site = (process.env.SF360_HOSTING_SITE || (project ? `${project}-sf360` : "")).trim();
if (project && !/^[a-z][a-z0-9-]{4,29}$/.test(project)) {
  console.error(`Not a valid Firebase project ID: ${project}`);
  process.exit(1);
}
if (site && !/^[a-z0-9][a-z0-9-]{2,62}$/.test(site)) {
  console.error(`Not a valid Hosting site name: ${site}`);
  process.exit(1);
}

const template = readFileSync(join(root, "firestore.rules.template"), "utf8");
if (template.split("__ALLOWED_EMAILS__").length !== 2) {
  console.error("firestore.rules.template must contain the __ALLOWED_EMAILS__ placeholder exactly once.");
  process.exit(1);
}
const list = emails.map((e) => `'${e}'`).join(", ");
writeFileSync(join(root, "firestore.rules"), template.replace("__ALLOWED_EMAILS__", list));
writeFileSync(join(root, "functions", ".env"), `ALLOWED_EMAILS=${emails.join(",")}\nSHADOWFAX_ENV=${env}\n`);

if (project) {
  const rc = { projects: { default: project }, targets: { [project]: { hosting: { sf360: [site] } } } };
  writeFileSync(join(root, ".firebaserc"), JSON.stringify(rc, null, 2) + "\n");
}

console.log(
  `Prepared deploy: ${emails.length} allowed account(s), Shadowfax environment = ${env}` +
    (project ? `, project ${project}, site ${site}.` : "."),
);
