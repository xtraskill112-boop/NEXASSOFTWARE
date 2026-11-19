#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy to Firebase WITHOUT a service-account key file
# (Workload Identity Federation). Run it in Google Cloud Shell:
#   https://console.cloud.google.com/?cloudshell=true&project=naamdevseets
# "already exists" messages are fine — the script can be run again safely.
P="${1:-naamdevseets}"
R="${2:-xtraskill112-boop/NEXASSOFTWARE}"
SA="github-deploy@$P.iam.gserviceaccount.com"
gcloud config set project "$P"
N="$(gcloud projects describe "$P" --format='value(projectNumber)')"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com
gcloud iam service-accounts create github-deploy --display-name="GitHub deploy" 2>/dev/null || true
gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" --role=roles/owner --condition=None --quiet >/dev/null
gcloud iam workload-identity-pools create github --location=global --display-name=GitHub 2>/dev/null || true
gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='$R'" 2>/dev/null || true
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$R" --quiet >/dev/null
echo "Done: GitHub ($R) can now deploy to $P without a key. Project number: $N"
