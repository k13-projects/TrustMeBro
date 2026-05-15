# TrustMeBro — Working Conventions

This file is the source of truth for how we work on TrustMeBro. It is loaded into
Claude Code on every session via `CLAUDE.md`. Keep it tight and current.

---

## Branch naming

Format:

```
{project_shortname}_{mon}{dd}_v{N}
```

- `project_shortname` — `tmb`
- `mon` — three-letter lowercase month (`jan`, `feb`, …, `dec`)
- `dd` — two-digit day of the month (zero-padded)
- `N` — integer version for that day, starting at `1`

Examples:

- `tmb_may14_v1`
- `tmb_may14_v2`
- `tmb_jun03_v1`

If a branch with the same date+version already exists, increment `N`.

---

## The Hail Mary

Triggers (case-insensitive, any of):

- `hail mary`
- `hail mary that shit`
- `hail mary pls` / `hail mary please`
- `hm`
- `hm pls` / `hm please`

When triggered, run these steps in order:

1. **Create a new branch** following the branch-naming convention above, then
   check out to it.
2. **Stage and commit** with a message that documents all the work in this
   session: changes implemented, things thought through, decisions made. The
   commit is a living historical record — capture the sweat and tears.
   - Use **grouped bullets**.
   - The top of the message must be readable at a glance by a non-technical
     reader.
   - Deeper technical detail goes at the **bottom** of the message.
   - **Do not label the sections** as "non-technical" / "technical" — let the
     structure speak for itself (e.g. a horizontal rule separating the
     overview from a "Technical details" section is fine).
3. **Push** the branch with `-u` so it tracks the remote.

### Variant: `hm-1`

Same as Hail Mary, but **skip step 1**. Use this when we are already on the
branch we want the work to land on.

### Variant: `hm++`

Full end-to-end ship. Same as Hail Mary, plus two more steps:

4. **Open a pull request** against `main` using `gh pr create` with a tight
   summary + test plan (same format as the project's previous PRs).
5. **Merge the PR** with `gh pr merge <num> --merge` (a real merge commit;
   no squash, no rebase, no `--delete-branch` — keep every `tmb_*` branch
   on origin per the standing rule).

Use `hm++` when the work is ready to land on `main` and you don't want to
ceremoniously do the PR + merge in a separate turn. The PR title and body
should mirror the commit message's overview (short summary + test plan);
the deeper technical detail still lives in the commit.

---

## Notes for future conventions

Add new conventions as new top-level sections in this file. Keep examples and
"why" lines so they survive context resets.
