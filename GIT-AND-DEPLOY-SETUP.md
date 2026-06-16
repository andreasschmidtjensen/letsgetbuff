# LetsGetBuff — Git + Auto-Deploy Setup Guide

A complete, beginner-friendly walkthrough to put this project under Git, push it to
GitHub, and have it **deploy automatically to your VPS every time you push**.

No prior Git experience assumed. Run the commands exactly as shown. Lines starting
with `#` are comments you don't type.

---

## The big picture

```
  Your PC              GitHub                                  Your VPS
  -------              ------                                  --------
  edit code --push-->  builds the Docker image                pulls the finished
                       pushes it to the registry (GHCR)  -->  image and restarts
                       then SSHes into the server              (no building here)
```

You only ever do one thing day-to-day: **save your changes and push them.** GitHub builds
the image and the server just downloads it. You will set this up once.

---

## ⚡ STATUS — most of this is already done

I configured your VPS (`89.149.243.173`) directly. Here's where things stand:

**✅ Done on the server already:**

- Docker, Docker Compose, and Git are installed (they already were).
- `/opt/letsgetbuff` is now a proper **git clone** of `andreasschmidtjensen/letsgetbuff`
  (the repo is public, so no credentials are needed to pull).
- Your existing `.env` (with `SESSION_SECRET` + `ANTHROPIC_API_KEY`) was preserved and
  backed up. Your old manual copy is saved at `/opt/letsgetbuff-manual-backup-<date>`.
- A dedicated SSH **deploy key** for GitHub Actions was created and authorized; I verified
  key-based login works. The app container is still running and untouched.
- The "unhealthy" flag was diagnosed: the healthcheck used `localhost` (IPv6 `::1`) but the
  app listens on IPv4. **I fixed it** in `Dockerfile` and `docker-compose.yml` (now
  `127.0.0.1`). It clears on your next deploy.

**📋 What's left for YOU (the parts needing your GitHub login):**

1. **Confirm you can push to `andreasschmidtjensen/letsgetbuff`.** It's not your repo, so you
   need to be a collaborator. If you're not, ask Andreas to add you, or fork it to your
   account (if you fork, tell me and I'll repoint the server's remote to your fork).
2. **Push your local code** (Parts 1–4 below). Your local copy has the newest code plus the
   `.gitignore`, the deploy workflow, and the healthcheck fix — pushing makes GitHub the
   source of truth and puts the auto-deploy workflow in place.
3. **Add 4 repository secrets** on GitHub (Part 7). I'll give you the exact values — the
   private key is in our chat (never written to any file, since this guide gets committed).
4. **Make the built image public** once, so the server can pull it (Part 7a) — one click
   after your first push.

After that, every `git push` auto-deploys: GitHub builds the image, the server pulls it.
The detailed reference for each step is below.

---

Three new files are already in your project, created for you:

- `.gitignore` — tells Git which files to never upload (secrets, `node_modules`, the
  database, build output). **This is the most important safety file** — it keeps your
  `ANTHROPIC_API_KEY` and `SESSION_SECRET` out of GitHub.
- `.github/workflows/deploy.yml` — the "Build and Deploy" GitHub Action: builds the image,
  pushes it to GHCR, then tells the server to pull and restart.
- `GIT-AND-DEPLOY-SETUP.md` — this guide.

---

## Part 1 — Install Git on your PC (one time)

**Windows:** download from <https://git-scm.com/download/win> and install with all the
default options. When it asks about a default editor, you can pick "Notepad" if Vim
looks scary.

After installing, open a terminal (search "Git Bash" or "PowerShell" in the Start menu)
and check it works:

```bash
git --version
```

Then tell Git who you are (used to label your commits). Use the same email as your
GitHub account:

```bash
git config --global user.name "Jacob"
git config --global user.email "jacob@cphgamelab.dk"
git config --global init.defaultBranch main
```

---

## Part 2 — Open your project in the terminal

Navigate to the project folder (the one containing `package.json` and `Dockerfile`):

```bash
cd "C:/Users/iamtr/OneDrive/Documents/Claude/Projects/GYMN app/letsgetbuff-main/letsgetbuff-main"
```

> **Note:** there is a leftover, incomplete `.git` folder from an earlier automated
> attempt that couldn't finish (your OneDrive folder blocked it). **Delete it first** so
> you start clean. In File Explorer turn on "Hidden items" and delete the `.git` folder,
> or in the terminal run:
>
> ```bash
> rm -rf .git        # Git Bash
> # or in PowerShell:  Remove-Item -Recurse -Force .git
> ```

Also good to know: a few `vite.config.ts.timestamp-*.mjs` files are sitting in the
folder. They're harmless temp files and `.gitignore` already excludes them, so they
won't be uploaded. You can delete them anytime.

---

## Part 3 — Connect to GitHub (authentication)

Pushing code requires proving you're you. The easiest way for a beginner is the
**GitHub CLI**, which handles login in a browser — no tokens to copy around.

1. Install it from <https://cli.github.com/> (default options).
2. Log in:

```bash
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Login with a web browser**. It shows a code,
opens your browser, you paste the code and approve. Done — Git can now push.

<details>
<summary>Alternative without GitHub CLI (Personal Access Token)</summary>

Create a token at <https://github.com/settings/tokens> → "Generate new token (classic)"
→ tick the **repo** scope → generate → copy it. When Git later asks for a password,
paste the token (not your GitHub password). Windows will remember it.
</details>

---

## Part 4 — Put the project under Git and push to your existing repo

You said this project started life as a GitHub repo and you want to push back to that
same repo. First find its URL: on the repo's GitHub page click the green **Code** button
and copy the **HTTPS** URL (looks like `https://github.com/<you>/letsgetbuff.git`).

Now, from inside the project folder:

```bash
# 1. Start a fresh Git repository here
git init -b main

# 2. Stage every file (.gitignore automatically excludes the stuff that shouldn't go up)
git add .

# 3. SAFETY CHECK — make sure no secrets are staged. This should print NOTHING:
git status | grep -i "\.env$"
#    and confirm node_modules / *.db are NOT listed in the output of:
git status

# 4. Make your first commit (a labelled snapshot)
git commit -m "Initial commit: existing LetsGetBuff app + Docker + CI/CD"

# 5. Point this repo at your GitHub repo (paste your real URL)
git remote add origin https://github.com/<your-username>/letsgetbuff.git
```

Now push. Because the GitHub repo already has history and your local copy was downloaded
as a ZIP (so it doesn't share that history), pick the path that matches your situation:

**Path A — the GitHub repo is essentially empty or you don't care about what's there:**

```bash
git push -u origin main
```

If GitHub *rejects* this with a message about the remote containing work you don't have,
and **you are certain your local copy is the version you want to keep**, overwrite the
remote (safe for a solo project, this is your own repo):

```bash
git push -u --force-with-lease origin main
```

**Path B — the GitHub repo has commits you want to preserve and merge with:**

```bash
git pull origin main --allow-unrelated-histories   # may open an editor: save & close to accept
# resolve any conflicts it reports, then:
git push -u origin main
```

> For a solo project where your local folder is clearly the latest version, **Path A**
> is almost always what you want.

Refresh the repo page in your browser — your code is now on GitHub. 🎉

---

## Part 5 — Prepare the VPS  ✅ ALREADY DONE FOR YOU

This was all set up on your server (`89.149.243.173`) directly. Nothing to do here — it's
documented so you know what exists:

- Docker, Compose, and Git were already installed.
- `/opt/letsgetbuff` is a **git clone** of the repo (replaced the old manual copy, which is
  backed up at `/opt/letsgetbuff-manual-backup-<date>`).
- Your `.env` (with `SESSION_SECRET` + `ANTHROPIC_API_KEY`) was preserved in place — it stays
  on the server and is never committed to Git.
- The `/opt/calibre-web-automated/config` bind-mount path exists.
- The app container is running.

> If you ever rebuild this server from scratch, the original steps were: install Docker via
> `curl -fsSL https://get.docker.com | sudo sh`, `git clone` the repo into `/opt`, create the
> `.env` next to `docker-compose.yml` (generate `SESSION_SECRET` with `openssl rand -hex 32`),
> then `docker compose up -d`.

---

## Part 6 — Deploy key for GitHub → VPS  ✅ ALREADY DONE FOR YOU

A dedicated SSH key (`/root/.ssh/gh_deploy`) was created on your server and authorized, and
key-based login was verified. **You don't need to generate anything** — the private key to
paste into GitHub is in our chat (it was deliberately kept out of this file, since the file
gets committed to the repo). Use it for the `VPS_SSH_KEY` secret in Part 7.

---

## Part 7 — Add the secrets to GitHub

In your browser: your repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Add these four:

| Secret name   | Value (yours)                                                |
|---------------|--------------------------------------------------------------|
| `VPS_HOST`    | `89.149.243.173`                                             |
| `VPS_USER`    | `root`                                                       |
| `VPS_APP_DIR` | `/opt/letsgetbuff`                                           |
| `VPS_SSH_KEY` | the **entire private key** from our chat (incl. BEGIN/END)   |

(SSH is on the default port 22, so no `VPS_PORT` is needed.)

These secrets are encrypted and only the Action can read them. They never appear in logs.
(You do **not** need to add a GitHub token for the image — the workflow uses the built-in
`GITHUB_TOKEN` automatically to push to GHCR.)

---

## Part 7a — Make the container image pullable by the server (one time)

The workflow builds the image on GitHub and pushes it to **GHCR**
(`ghcr.io/andreasschmidtjensen/letsgetbuff`). By default that image is **private**, so the
server can't pull it yet. The simplest fix (your source repo is already public, so this
leaks nothing):

1. Push once so the image gets created (Part 8).
2. On GitHub go to the repo → **Packages** (right sidebar) → click the `letsgetbuff` package
   → **Package settings** → **Change visibility** → **Public**.

Now the server pulls with no credentials. *(Prefer keeping it private? Create a token with
`read:packages`, store it as a secret, and add a `docker login ghcr.io` line to the deploy
script — ask me and I'll wire it up.)*

---

## Part 8 — Test the auto-deploy

How it works now: on push, GitHub **builds the Docker image**, pushes it to GHCR, then SSHes
into the server which just runs `git pull` (for the compose file) + `docker compose pull` +
`up -d`. **Your server never builds** — it only downloads the finished image.

It triggers on every push to `main`. Test it now:

```bash
# make any tiny change, e.g. edit the README, then:
git add .
git commit -m "Test auto-deploy"
git push
```

Go to your repo → **Actions** tab. You'll see "Build and Deploy" running — first the
**build** job (builds + pushes the image), then the **deploy** job (SSHes in, `git pull`,
`docker compose pull`, restart). Green checks = your change is live. You can also re-run it
manually from that tab (the `workflow_dispatch`).

> Reminder: on the **very first** run the deploy job will fail at `docker compose pull`
> because the image starts out private — do the one-time Part 7a visibility toggle, then
> re-run.

---

## Part 9 — Your everyday workflow (this is all you need from now on)

```bash
git add .
git commit -m "describe what you changed"
git push
```

That's it. Every push redeploys automatically. To pull changes you made elsewhere:
`git pull`.

---

## Security checklist

- ✅ Real secrets live in `.env` **on the VPS** and in **GitHub Actions secrets** — never
  in the code, never in Git. `.gitignore` enforces this.
- ✅ The deploy SSH key is dedicated to GitHub Actions; if it ever leaks you can remove
  that one line from the server's `~/.ssh/authorized_keys` without affecting your own
  login.
- ✅ If you ever accidentally commit a secret, treat it as compromised: rotate it (generate
  a new `SESSION_SECRET`, revoke and reissue the Anthropic key) — removing it from a later
  commit is not enough once it's been pushed.

---

## Troubleshooting

- **`git push` says "permission denied" / asks for a password repeatedly:** re-run
  `gh auth login`, or check your Personal Access Token has the `repo` scope.
- **Action fails at the SSH step:** double-check `VPS_HOST`, `VPS_USER`, and that you
  pasted the *whole* private key (with BEGIN/END lines) into `VPS_SSH_KEY`. Confirm you
  can `ssh youruser@host` yourself.
- **Action SSHes in but `docker compose` fails:** make sure Docker is installed and your
  user is in the `docker` group (Part 5), and that `.env` exists in `VPS_APP_DIR`.
- **`docker compose pull` fails with "denied" / "unauthorized" on the server:** the GHCR
  image is still private. Make it public once (see Part 7a) or log the server into GHCR.
- **Rollback to a previous version:** the simplest way is `git revert` the bad commit and
  push — GitHub rebuilds and redeploys the older code automatically. (Every image is also
  tagged with its commit SHA in GHCR if you ever want to pin an exact one.)
- **"It deployed but I see the old version":** hard-refresh the browser; check
  `docker compose logs -f` on the server.

---

*Questions or stuck on a step? Tell me which part number and what the error says.*
