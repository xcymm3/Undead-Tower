# Last-call delivery report

## Usable core delivered

- WI-001–WI-014 are implemented: giant route validation, shared critical-hit and damage rules, doubled six-weapon reload configuration, playable three-second preparation, staged ten-enemy wave pools, charger/howler/skitter/berserker behaviors and feedback, wizard teleport feedback, synthesized metal audio, Hallmark UI tokens, shared model/replay diagnostics, and browser integration coverage are integrated in the web source.
- The implementation preserves fixed facing, shared aim/trajectory targets, muzzle obstruction, effective play clocks, instanced enemies, bounded effects, practice behavior, and versioned six-weapon leaderboards.
- iteration-020 freshly passed the previously outstanding upgrade-presentation and natural-failure flows, then covered the complete 38-scenario browser suite with 37 passes plus a targeted pass of the only changed flaky assertion.
- The sole full-run failure was not a product failure: the target was killed correctly, but cross-process polling missed the 0.65-second blood effect. The check now samples that transient effect inside the page render loop and retains a stable burst-count assertion; its targeted rerun passed 1/1.

## Mandatory criteria still incomplete

- WI-015 remains incomplete. A fresh uninterrupted 864-run production matrix and fixed 12-run real-browser pairing have not completed. The interrupted 298/864 journal is explicitly non-formal and must not be resumed or promoted.
- WI-016 remains incomplete. The 58-gate Hallmark review, final resource/idle stress pass, and final documentation audit have not completed. Seven viewport paths now pass dynamically in the full E2E run, but verifier-owned final regression remains outstanding.
- Consequently AC1–AC14 have no fresh criterion-level evidence or independent verdict. This report is not a PASS verdict.

## Checks actually run in iteration-020

- Upgrade presentation plus both survival tests: 3/3 passed in 4.2 minutes, including eight cleared waves and natural failure on wave 9.
- Full hidden single-worker E2E: 37/38 passed in 12.2 minutes. All gameplay, audio, preparation, critical-hit, seven-viewport UI, six-weapon, and survival paths passed except the transient blood-effect sampling race described above.
- Revised headshot/blood-effect scenario: 1/1 passed in 12.5 seconds with page-local frame sampling.
- No 864 matrix, 12-run pairing, resource stress, 58-gate audit, or independent verification was claimed in this iteration.

## Smallest defensible additional budget

- Mandatory implementation and integration: 44–70 active minutes. The last clean matrix attempt produced 298/864 samples in about 12.4 minutes, implying roughly 36 minutes for an uninterrupted run before its report/threshold checks; the 25-minute iteration ceiling therefore requires a bounded performance improvement before that formal run, followed by the 12-run pairing and WI-016 audit/stress work.
- Remaining evidence and independent verification: 18–30 active minutes, plus about 12 minutes risk reserve for long-run or browser variance.
- At least four further proof-loop iterations are defensible: optimize and complete build, collect fresh evidence, independently verify, and retain one fix/reverify iteration if a gate fails.
