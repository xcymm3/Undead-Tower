# Evidence Bundle: rogue-playtest-revision-20260905

## Summary

- Overall status: PASS
- Regression: 20 unit files / 175 tests PASS; TypeScript + production build PASS; one headless muted Playwright worker 38/38 PASS.
- Balance: 864/864 formal runs, zero gaps, configuration SHA-256 `27980eb37198d94e8e2226863db127aa90b0e8857e62367ca5325e50ce73775c`.
- Calibration: 12/12 sequential real-scene pairs PASS; completed-wave difference median 0, maximum 3, wave-50 classification agrees.
- Resources: PASS, maxAlive 20, maxEffects 127. Visuals: 170 current-scene captures, 20/20 icons, 10/10 enemies, 3/3 rarities, zero machine gaps.

## Acceptance criteria

AC1–AC14 are all PASS. The exact frozen criterion text, criterion-level proof and empty `gaps` arrays are recorded in `evidence.json`.

## Commands and raw proof

- `raw/checks/`: unit, build, E2E and diff-check logs.
- `raw/balance/`: formal report, all 864 JSONL samples, manifest and command log (382.8 s).
- `raw/replay/`: complete 12-pair report and command log (490.7 s).
- `raw/resources/`: pressure/restart report and command log.
- `raw/visual/`: capture manifest and selected enemy, feedback, responsive-upgrade and transition frames.
- `raw/hallmark/slop-review.md`: six-axis critique (minimum 4/5) and all 58 gates (all No).

The local `npm.ps1` shim is broken, so checks used `C:\Program Files\nodejs\npm.cmd` as permitted by the frozen plan. `git diff --check` exited 0. No portable packaging command was run.

## Known limitations

- Fixed agents and deterministic replays are not human playtest samples.
- Silent automation does not replace subjective speaker/headphone evaluation.
- Hallmark is an internal implementation review, not external art-direction certification; the fresh verifier must independently inspect visual proof.
