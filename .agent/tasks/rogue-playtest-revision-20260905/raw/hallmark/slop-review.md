# Hallmark 1.1.0 final review

Scope: the locked `design.md` app system and the touched deployment/home, settings, upgrade/build, feedback, and reduced-motion surfaces. Genre: atmospheric. Macrostructure: compact Workbench over the live low-poly scene. The application is a game UI, so marketing-only gates are recorded as no/not applicable rather than treated as missing page sections.

## Pre-emit critique

- Philosophy 5/5: fixed-watch survival decisions drive the interface.
- Hierarchy 5/5: mode/weapon/start, setting/value/complete, and upgrade/value/confirm read in that order.
- Execution 4/5: seven viewport assertions and screenshots, keyboard paths, motion lifecycle, and contrast/token scans pass.
- Specificity 5/5: Pine Ridge field-console language and the live original low-poly scene are retained.
- Restraint 5/5: repeated explanatory copy was removed while decision data remains.
- Variety 4/5: Workbench/game-console composition avoids a marketing-page rhythm; upgrade icons now sit beside titles instead of the three-tile icon-above-heading default.

No score is below 3.

## 58-gate sweep

Every answer below is **No** after the listed fixes.

1. No — display is Barlow Condensed, not a default face.
2. No — no purple/blue or text gradient; the scene vignette uses named dark tokens.
3. No — initial three equal cards had icons above headings; fixed by the `.card-title` icon-left/title-right row and rechecked at 320/768/1440.
4. No — no card nests another card.
5. No — rarity is a thin top rule, not a thick side stripe.
6. No — the live-canvas intro is left-led on desktop; mobile keeps the title and deployment workbench as separate blocks.
7. No — base colours are tinted OKLCH tokens, not pure black/white.
8. No — this app uses its locked Workbench structure, not hero/features/CTA/footer or a new repeated Hallmark output.
9. No — live canvas, panel surfaces, rules, and HUD zones provide distinct rhythm.
10. No — no `transition: all`.
11. No — no repeated uniform hover scale.
12. No — only named non-overshoot easings are used.
13. No — initial upgrade hover moved and recoloured; fixed to background feedback only.
14. No — animated properties are opacity/transform; no layout property is animated.
15. No — focus outlines appear immediately.
16. No — success is inline state, not a redundant toast.
17. No — build details appear immediately on keyboard focus; no equal-delay tooltip implementation.
18. No (not applicable) — there is no auto-rotating content.
19. No — no placeholder names or startup clichés.
20. No — Hallmark macrostructure/pre-emit stamps are present.
21. No — macrostructure is Workbench, not Specimen.
22. No — neutral surface tokens have non-zero chroma.
23. No — amber accent is limited to actions, rules, values, and small marks.
24. No — touched redesign spacing uses the named 4-point scale; legacy 3D/HUD geometry is outside the frozen Hallmark touch boundary.
25. No — decision copy is bounded by panels/cards and remains readable in the rendered screenshots.
26. No — touched controls expose default/hover/focus/active/disabled plus wired loading/error/success states.
27. No — upgrade motion becomes opacity-only; hit-scale and breach-impact animations are disabled under reduced motion.
28. No (not applicable) — no demo video.
29. No — no decorative abstract background; the live playable scene is semantic.
30. No — one project-native SVG language, no emoji icons or mixed libraries.
31. No (not applicable) — no Lottie or decorative illustration library.
32. No — no repeated prior page archetype is emitted; the only app-level log entry is the current locked system.
33. No — decorative SVGs/canvas are hidden or labelled in `App.tsx`.
34. No — `html` and `body` use `overflow-x: clip`; all seven widths assert no horizontal overflow.
35. No (not applicable) — no text highlighter band/decorative underline.
36. No — mixed-height toolbars, headings, mode rows, and CTA rows explicitly align items.
37. No — exactly two font families are used.
38. No (not applicable) — no outlier font.
38a. No — no italic heading/display type.
39. No — range/select/toggles keep stable borders and visible focus; disabled controls use native state, opacity, cursor, and text/state cues.
40. No — sand-on-dark body copy and focus/amber pairs remain visibly separated in all inspected surfaces.
41. No — accent fills use `--color-accent-ink`; dark panels set light text through the locked tokens.
42. No — the topbar is an in-game N9 edge-aligned HUD, not the default marketing nav.
43. No — the play footer is a compact status/controls strip, not four link columns.
44. No — at 1280×720/1440×900 the title, decision panel, and primary CTA fit without scrolling.
45. No — the low-poly scene, station mark, crosshair, and status symbols all carry game meaning.
46. No — no fabricated marketing metric; displayed counts and percentages come from game state.
47. No — no fake browser/phone/IDE chrome.
48. No — touched UI colours/fonts reference named tokens; 3D material colours are excluded by the frozen contract.
49. No — clickable labels remain single-line at all seven widths.
50. No — applicable grids use `minmax(0,1fr)` and contain no intrinsic bitmap that can force overflow.
51. No — display/upgrade headings have long-word wrapping and zero minimum width where needed.
52. No (not applicable) — no theme-specific multi-column eyebrow/heading override.
53. No (not applicable) — no CSS radio-tab pattern.
54. No — eyebrows and headings stack vertically.
55. No — no all-caps wrapped display heading with sub-1 line height.
56. No (not applicable) — no competing sticky-at-zero elements.
57. No (not applicable) — no prior `study` diagnosis was discarded.

## Rendered and interaction evidence

- Fresh full Playwright run: 38/38, one headless Chrome worker, audio muted, 7.9 minutes.
- Post-fix UI rerun: 17/17 covering home/settings at 320/375/390/414/768/1280/1440, critical upgrades at seven widths, long cards, keyboard selection, one-shot confirmation, and build details.
- Visually inspected: all seven fresh home screenshots; all seven fresh settings screenshots; all seven pre-fix upgrade screenshots; and post-fix upgrade screenshots at 320, 768, and 1440. No horizontal clipping, overlapped controls, two-line CTA, unreadable focus state, or crosshair/HUD obstruction was observed.
- Upgrade cards scroll vertically on narrow screens by design; the 320×568 home keeps the decision panel scrollable rather than shrinking decision text below the readable scale.

## Known limits

- This is an internal implementation review, not external art-direction certification.
- Browser checks are silent, so they do not replace subjective speaker/headphone evaluation of the metal sound.
- Automated agents and deterministic replays are not human playtest samples.
