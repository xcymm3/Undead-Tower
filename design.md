# Design — 灰松哨站

This app shares one system across deployment, settings, upgrades, HUD and results.

## Genre and structure
Atmospheric; utilitarian field equipment. App pages use a compact Workbench over the original live low-poly scene. Preserve existing information architecture and component ownership. Deployment selects mode/weapon then starts; settings adjusts sound/picture; upgrades compares three actual benefits then confirms.

## Theme and typography
Existing named tokens in `tokens.css` and `src/ui/rogue-tokens.css` are authoritative: dark forest surfaces, sand text, amber action accent. Use `--color-rogue-paper`, `--color-rogue-muted`, `--color-rogue-panel`, `--color-rogue-deep`, `--color-rogue-line`, `--color-rogue-focus` and rarity tokens. Add any necessary color to the token file before consuming it. Keep Barlow Condensed display and IBM Plex Mono body through existing font tokens; upright headings, no third font.

## Spacing and motion
Use the existing named 4-point spacing scale; expand it only in the token source. State transitions use named durations/easings. Upgrade entry/exit uses opacity and transform; no input-blocking overlay. Reduced motion uses immediate or short opacity-only state changes. Countdown never covers crosshair, ammo or skill.

## Interaction and copy
Keep visible keyboard focus, default/hover/focus/active/disabled/loading/error/success where applicable. Loading and errors describe actual state. Critical feedback distinguishes body critical and critical headshot in words, not color alone. Upgrade icons have distinct geometry and inherit currentColor. Cards show actual before/after numbers from shared production formulas.

## Shared voice and responsive rules
Primary actions use concise Chinese verbs. Remove redundant subtitles and background copy; retain weapon differences, costs, cooldowns and counterplay that affect decisions. No marketing metrics or decorative assets. All app views retain existing wordmark, fonts, accent and CTA shape. Verify 320/375/390/414/768/1280/1440 widths, keyboard, text overflow and reduced motion before declaring the redesign complete.
