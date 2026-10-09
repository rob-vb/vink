# PLAN: demo waterschade (replaces the pakbon)

Spec: `.scratch/demo-waterschade/spec.md`. Worktree: `/mnt/HC_Volume_105734306/worktrees/docuhelper-demo-waterschade`, branch `demo-waterschade` (from `any-input` 7f49572). No push, no deploy.

Every step ends green on `npm run typecheck`, `npx eslint . --ignore-pattern ".next-e2e/**"`, `npm test`, and is one commit.

Setup notes: `node_modules` is a symlink to the main checkout; run `npx next typegen` once for `PageProps`; copy the gitignored `fixtures/documents/invoice-001/document.pdf` from the main checkout for `claudeBridge.test.ts`.

- [x] 0. Remove "Jev" from user-facing copy (user request). Proof: grep `Jev` in messages/app/components = only code comments. Commit 302f7a3.
- [x] 1. Names and content. Proof: values + web check under "Comments" in the spec.
- [x] 2. Demo data: seed `claim` (email + PDF + 2 photos), drop delivery seed, Orders "Leverdatum", newsletter "gratis bezorging". Demo email attachments may be a PDF (drawn pages) or a photo. Proof: `demo-data.test.ts` green.
- [x] 3. Demo papers: meldformulier page + 2 SVG photos; pakbon gone. Proof: PNG renders looked at (light + dark, 390 px).
- [x] 4. Home + features: `deliveryNote` → `claimForm`, copy NL + EN. Proof: grep `delivery|pakbon|pallet` in those files.
- [x] 5. Domain grep + browser e2e on port 3013, screenshots as Artifact. Proof: hit list + link.
- [ ] 6. (optional) eval fixture `synthetic-claim-email-001`. Proof: harness loads it.

Status 2026-10-09: steps 0–5 done (commits 302f7a3..8cfd771). Screenshots: https://claude.ai/artifact/SiYfNwKFCq2Vgnb4Eb34Yd. Step 6 not started (optional; waits for the user).
