# CI workflow

`ci.github-workflow.yml` is the GitHub Actions pipeline for this repo
(install → build → lint → type-check → test).

It lives here instead of `.github/workflows/` because the bot account that
initialized the repo lacks the GitHub `workflow` OAuth scope, so it could not
push files under `.github/workflows/`. A maintainer with `workflow` scope
should copy it into place:

```bash
mkdir -p .github/workflows
cp ci/ci.github-workflow.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "Add CI workflow" && git push
```
