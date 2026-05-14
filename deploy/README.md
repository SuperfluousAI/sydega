# Sydega deploy runbook

Steps to take sydega from this local repo to live at
`https://sydega.superfluous.ai` on the superfluous-ai platform.

Read top-to-bottom. Each step is independent — pause anywhere if something
looks off.

---

## 1. Create the GitHub repo

```bash
# From this directory (the sydega source repo, currently named
# `systems-design-game` locally).
gh repo create SuperfluousAI/sydega \
  --public \
  --description "Systems-design teaching game — sydega.superfluous.ai" \
  --source . \
  --remote origin \
  --push
```

Flags:
- `--public` — easy to flip private later via `gh repo edit`. Keep open while it grows; tighten if business reasons appear.
- `--source .` + `--push` — creates the remote AND pushes the current branch (`master`) in one shot.

If you want to land on `main` (org convention) before pushing:

```bash
git branch -m master main
gh repo create SuperfluousAI/sydega --public --source . --remote origin --push
```

After this: `https://github.com/SuperfluousAI/sydega` exists and contains the
current state of this directory.

---

## 2. Build + push the Docker image to ECR

Multi-arch (the platform mixes ARM EC2 / Hetzner with x86 VPS — single-arch
images fail to schedule on the other arch).

```bash
# From the sydega repo root (this directory).

# ECR login. Uses the team credentials profile.
aws ecr get-login-password --region us-east-1 --profile superfluous-ecr | \
  crane auth login 596633517329.dkr.ecr.us-east-1.amazonaws.com -u AWS --password-stdin

# Build + push. Tag is timestamp-based — ECR has tag immutability,
# every build gets a unique tag.
TAG="sydega-$(date +%Y%m%d-%H%M%S)"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t 596633517329.dkr.ecr.us-east-1.amazonaws.com/superfluous-apps:$TAG \
  --push .

echo "Pushed: $TAG"
```

After this: an image at `596633517329.dkr.ecr.us-east-1.amazonaws.com/superfluous-apps:<TAG>`.

**Verify locally before push (optional but quick):**

```bash
docker buildx build --platform linux/amd64 --load -t sydega:local .
docker run --rm -p 8080:8080 sydega:local
# In another shell:
curl -s http://localhost:8080/healthz   # → "ok"
open http://localhost:8080              # the app
```

---

## 3. Land the chart in the platform repo

The chart lives in `superfluous-ai/apps/sydega/chart/` regardless of where
the source lives. Copy from this repo's `deploy/chart/`:

```bash
# Assume superfluous-ai is checked out as a sibling.
cd ../superfluous-ai   # adjust if your layout differs

mkdir -p apps/sydega/chart/templates
cp ../systems-design-game/deploy/chart/Chart.yaml          apps/sydega/chart/
cp ../systems-design-game/deploy/chart/values.yaml         apps/sydega/chart/
cp ../systems-design-game/deploy/chart/values.secrets.yaml apps/sydega/chart/
touch apps/sydega/chart/templates/.gitkeep
```

Then **edit `apps/sydega/chart/values.yaml`** and replace the placeholder
`image.tag` with the actual tag from step 2:

```bash
# Either by hand, or via sed:
sed -i '' "s/sydega-0.1.0-placeholder/$TAG/" apps/sydega/chart/values.yaml
```

(Use `sed -i ''` on macOS, `sed -i` on Linux.)

**Verify the chart renders before committing:**

```bash
# From the superfluous-ai repo root.
helm dependency update apps/sydega/chart
helm template sydega apps/sydega/chart \
  -f apps/sydega/chart/values.yaml \
  -f apps/sydega/chart/values.secrets.yaml | less
```

Expect: Namespace, Deployment, Service, HTTPRoute, NetworkPolicy,
ResourceQuota, HTTPScaledObject (KEDA). All `app.kubernetes.io/name: sydega`
labels.

---

## 4. Commit + push to trigger ArgoCD

```bash
# Still in superfluous-ai.
git add apps/sydega/
git commit -m "apps/sydega: initial chart for systems-design-game

Wraps infra/helm/app-v3. Vite SPA served by nginx, port 8080.
Scale-to-zero enabled; no secrets; quota tightened for the small
static footprint. Source: SuperfluousAI/sydega @ <commit-sha>."
git push origin main
```

ArgoCD watches `apps/*/chart/` on main and auto-syncs within ~10s.

---

## 5. Verify the live app

```bash
# Watch the app come up.
kubectl get pods -n app-sydega -w

# Check ArgoCD's view.
kubectl get application sydega -n argocd -o jsonpath='{.status.sync.status},{.status.health.status}{"\n"}'
# → "Synced,Healthy" when ready.

# HTTPRoute hostname.
kubectl get httproute sydega -n app-sydega -o jsonpath='{.spec.hostnames}'
# → ["sydega.superfluous.ai"]

# Hit it.
curl -s -o /dev/null -w "%{http_code}\n" https://sydega.superfluous.ai
# → 200

open https://sydega.superfluous.ai
```

---

## 6. Subsequent updates

After the initial deploy, the loop is:

```bash
# In SuperfluousAI/sydega:
git pull  # if needed
# ... make changes, commit, push to main of sydega repo ...

# Rebuild + push image:
TAG="sydega-$(date +%Y%m%d-%H%M%S)"
docker buildx build --platform linux/amd64,linux/arm64 \
  -t 596633517329.dkr.ecr.us-east-1.amazonaws.com/superfluous-apps:$TAG \
  --push .

# In SuperfluousAI/superfluous-ai:
sed -i '' "s/^      tag: .*/      tag: $TAG/" apps/sydega/chart/values.yaml
git commit -am "apps/sydega: bump image to $TAG"
git push origin main
# ArgoCD syncs within ~10s.
```

Future CI automation (sibling-repo build auto-bumping the platform chart
values) is the next thing to land. Today step 2 is manual — same as every
other Layer 2 app right now.

---

## Notes / gotchas

- **`/healthz`** is served by nginx (see `nginx.conf` at the source repo
  root). The chart's `healthCheck.readiness` + `healthCheck.liveness` point
  at it. Removing the location block in nginx.conf will make pods fail
  readiness and never go ready — keep it in sync if you touch nginx.conf.

- **Scale-to-zero** is on by default. First request after idle takes ~3s
  (KEDA cold start). To disable, set `app.scaleToZero.enabled: false` in
  values.yaml. Worth doing if you're demoing live and want the snappiest
  first hit.

- **Tag immutability**: ECR rejects pushes to existing tags. The
  timestamp-based pattern handles this. If you ever get
  `tag-immutability` errors, just rebuild with a fresher timestamp.

- **Multi-arch builds**: the platform mixes ARM (EC2 / Hetzner) and x86
  (VPS). Single-arch images will fail to schedule on the other arch. The
  `--platform linux/amd64,linux/arm64` flag is load-bearing.

- **Cloudflare DNS**: `*.superfluous.ai` already wildcards to the platform
  EIP via Cloudflare. No DNS work needed for `sydega.superfluous.ai`.

- **No secrets means no SOPS workflow.** If you later need an API key,
  use `./infra/scripts/app-secrets.sh edit sydega` from the superfluous-ai
  repo — it'll re-encrypt `values.secrets.yaml` with the platform age key.
