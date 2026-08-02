export function pageCss() {
  return String.raw`
    :root {
      color-scheme: light dark;
      --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
      --radius: 10px;
      --background: #fafafa;
      --foreground: #0a0a0a;
      --card: #ffffff;
      --card-foreground: #0a0a0a;
      --primary: #171717;
      --primary-foreground: #fafafa;
      --secondary: #f5f5f5;
      --secondary-foreground: #171717;
      --muted: #f5f5f5;
      --muted-foreground: #737373;
      --accent: #f5f5f5;
      --accent-foreground: #171717;
      --border: #e5e5e5;
      --ring: #a1a1a1;
      --destructive: #e40014;
      --warning: #b45309;
      --warning-soft: color-mix(in srgb, #b45309 9%, var(--card));
      --success: #15803d;
      --success-soft: color-mix(in srgb, #15803d 10%, var(--card));
      --info-soft: color-mix(in srgb, #0369a1 9%, var(--card));
      --info: #0369a1;
      --log-background: #0c0c0c;
      --log-foreground: #d4d4d4;
      --shadow: 0 1px 2px rgb(0 0 0 / 0.05);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: #0a0a0a;
        --foreground: #fafafa;
        --card: #141414;
        --card-foreground: #fafafa;
        --primary: #fafafa;
        --primary-foreground: #171717;
        --secondary: #262626;
        --secondary-foreground: #fafafa;
        --muted: #1c1c1c;
        --muted-foreground: #a1a1a1;
        --accent: #262626;
        --accent-foreground: #fafafa;
        --border: #262626;
        --ring: #737373;
        --warning: #f59e0b;
        --success: #4ade80;
        --info: #38bdf8;
        --log-background: #000000;
        --shadow: 0 1px 2px rgb(0 0 0 / 0.4);
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 24px 64px; display: grid; gap: 16px; }

    header.page { display: flex; align-items: center; gap: 12px; padding: 4px 2px 8px; }
    .mark { width: 34px; height: 34px; border-radius: 9px; background: var(--primary); color: var(--primary-foreground); display: grid; place-items: center; font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }
    header.page h1 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
    header.page p { margin: 1px 0 0; font-size: 12.5px; color: var(--muted-foreground); }

    section.card { background: var(--card); color: var(--card-foreground); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px 18px; }
    section.card > h2 { margin: 0 0 12px; font-size: 13px; font-weight: 650; letter-spacing: 0.01em; color: var(--muted-foreground); text-transform: uppercase; }

    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .stat { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: color-mix(in srgb, var(--muted) 45%, var(--card)); }
    .stat .label { font-size: 11.5px; color: var(--muted-foreground); margin-bottom: 3px; }
    .stat .value { font-size: 14.5px; font-weight: 600; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    label.field { display: grid; gap: 5px; font-size: 12px; font-weight: 600; color: var(--muted-foreground); }
    input, textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--card); color: var(--foreground); font: inherit; font-size: 13px; transition: border-color .12s, box-shadow .12s; }
    input:focus, textarea:focus { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 30%, transparent); }
    textarea { min-height: 68px; resize: vertical; }

    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    button { border: 1px solid var(--border); border-radius: 8px; padding: 7px 13px; background: var(--card); color: var(--foreground); font: inherit; font-size: 13px; font-weight: 550; cursor: pointer; transition: background .12s, border-color .12s, transform .04s; }
    button:hover:not(:disabled) { background: var(--accent); color: var(--accent-foreground); }
    button:active:not(:disabled) { transform: translateY(0.5px); }
    button.primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
    button.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 86%, var(--primary-foreground)); color: var(--primary-foreground); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    #busy { font-size: 12.5px; color: var(--muted-foreground); }

    .pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 2px 9px; font-size: 11.5px; font-weight: 600; border: 1px solid var(--border); background: var(--muted); color: var(--muted-foreground); white-space: nowrap; }
    .pill.ready, .pill.published { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
    .pill.running { background: var(--info-soft); color: var(--info); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
    .pill.failed, .pill.version-mismatch { background: color-mix(in srgb, var(--destructive) 9%, var(--card)); color: var(--destructive); border-color: color-mix(in srgb, var(--destructive) 30%, transparent); }
    .pill.skipped, .pill.dry-run { background: var(--warning-soft); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }

    .steps { display: flex; align-items: flex-start; margin: 4px 0 12px; }
    .step { flex: 1; display: grid; justify-items: center; gap: 6px; position: relative; text-align: center; }
    .step::before { content: ''; position: absolute; top: 11px; left: -50%; width: 100%; height: 2px; background: var(--border); }
    .step:first-child::before { display: none; }
    .step .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border); background: var(--card); display: grid; place-items: center; font-size: 11px; font-weight: 650; color: var(--muted-foreground); position: relative; z-index: 1; }
    .step .name { font-size: 11.5px; color: var(--muted-foreground); }
    .step.done::before { background: var(--success); }
    .step.done .dot { border-color: var(--success); background: var(--success); color: #fff; }
    .step.done .name { color: var(--foreground); }
    .step.active::before { background: linear-gradient(to right, var(--success), var(--info)); }
    .step.active .dot { border-color: var(--info); color: var(--info); animation: pulse 1.4s ease-in-out infinite; }
    .step.active .name { color: var(--info); font-weight: 600; }
    .step.error .dot { border-color: var(--destructive); color: var(--destructive); }
    .step.error .name { color: var(--destructive); font-weight: 600; }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--info) 35%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }

    .warn { margin: 6px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-soft); color: var(--warning); font-size: 12.5px; border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent); }

    .artifact { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); }
    .artifact:first-child { border-top: 0; padding-top: 0; }
    .artifact code { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted-foreground); word-break: break-all; }
    .artifact .meta { font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }

    pre { margin: 0; font-family: var(--font-mono); font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; border-radius: 8px; padding: 12px 14px; background: var(--log-background); color: var(--log-foreground); }
    pre::-webkit-scrollbar { width: 8px; height: 8px; }
    pre::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 4px; }

    @media (max-width: 820px) { .stats { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
  `
}
