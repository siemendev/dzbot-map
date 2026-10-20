const CSS = `
[data-dzmap]{position:relative;overflow:hidden;background:var(--dzmap-background,#18181b);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;font-family:var(--dzmap-font,ui-sans-serif,system-ui,sans-serif)}
[data-dzmap][data-dzmap-fullscreen]{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;z-index:var(--dzmap-fullscreen-z,2147483000)!important}
.dzmap-viewport{position:absolute;inset:0;outline:none}
.dzmap-viewport:focus-visible{box-shadow:inset 0 0 0 2px var(--dzmap-focus,#71717a)}
.dzmap-pane{position:absolute;inset:0;pointer-events:none;isolation:isolate}
.dzmap-pane>*{pointer-events:auto}
.dzmap-world{position:absolute;z-index:0}
.dzmap-world img{position:absolute;user-select:none;-webkit-user-drag:none;max-width:none}
.dzmap-svg{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none}
.dzmap-controls{position:absolute;inset:0;pointer-events:none;z-index:10}
.dzmap-control{position:absolute;display:flex;flex-direction:column;gap:4px;pointer-events:auto}
.dzmap-pos-top-left{top:8px;left:8px;align-items:flex-start}
.dzmap-pos-top-right{top:8px;right:8px;align-items:flex-end}
.dzmap-pos-bottom-left{bottom:8px;left:8px;align-items:flex-start}
.dzmap-pos-bottom-right{bottom:8px;right:8px;align-items:flex-end}
.dzmap-pos-right{right:8px;top:50%;transform:translateY(-50%)}
.dzmap-pos-left{left:8px;top:50%;transform:translateY(-50%)}
.dzmap-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:28px;height:28px;padding:0;margin:0;box-sizing:border-box;border:1px solid var(--dzmap-control-border,#3f3f46);border-radius:var(--dzmap-radius,6px);background:var(--dzmap-control-bg,rgba(24,24,27,.9));color:var(--dzmap-control-fg,#d4d4d8);font-family:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;transition:border-color .15s,color .15s}
.dzmap-button:hover{border-color:var(--dzmap-control-border-hover,#71717a)}
.dzmap-button:focus-visible{outline:2px solid var(--dzmap-focus,#71717a);outline-offset:1px}
.dzmap-button[data-label]{padding:0 8px}
.dzmap-button[aria-pressed=false]{color:var(--dzmap-control-fg-off,#71717a);border-color:var(--dzmap-control-border-off,#52525b)}
.dzmap-button svg{width:13px;height:13px;flex:none}
.dzmap-button:disabled{opacity:.4;cursor:default}
.dzmap-button.dzmap-active{border-color:var(--dzmap-accent,#f26522);color:var(--dzmap-accent,#f26522)}
.dzmap-muted{color:var(--dzmap-muted,#a1a1aa)}
.dzmap-dim{color:var(--dzmap-dim,#71717a)}
.dzmap-accent{color:var(--dzmap-accent,#f26522)}
.dzmap-panel{box-sizing:border-box;border:1px solid var(--dzmap-panel-border,#3f3f46);border-radius:var(--dzmap-radius,6px);background:var(--dzmap-panel-bg,rgba(18,20,25,.97));color:var(--dzmap-text,#e7e7ea);font-size:13px;line-height:1.45;user-select:text;-webkit-user-select:text}
.dzmap-panel p{margin:4px 0 0;font-size:13px}
.dzmap-panel .dzmap-dim{font-size:12px}
.dzmap-ruler-panel{position:absolute;z-index:20;left:50%;bottom:16px;transform:translateX(-50%);width:min(380px,calc(100% - 16px));padding:12px 16px}
.dzmap-ruler-panel[hidden]{display:none}
.dzmap-panel-head{display:flex;align-items:flex-start;gap:12px}
.dzmap-panel-body{min-width:0;flex:1}
.dzmap-panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.dzmap-eyebrow{color:var(--dzmap-accent,#f26522);font:500 10px/1.4 var(--dzmap-mono,ui-monospace,monospace);letter-spacing:.16em;text-transform:uppercase}
.dzmap-ruler-total{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-top:4px;font-size:17px;font-weight:600;line-height:1.35}
.dzmap-ruler-total .dzmap-muted{font-weight:400}
.dzmap-icon-button{display:grid;place-items:center;width:28px;height:28px;flex:none;padding:0;border:0;border-radius:var(--dzmap-radius,6px);background:none;color:var(--dzmap-muted,#a1a1aa);cursor:pointer}
.dzmap-icon-button:hover{color:var(--dzmap-text,#e7e7ea)}
.dzmap-icon-button svg{width:15px;height:15px}
.dzmap-coordinates-group{bottom:26px}
.dzmap-coordinates{display:flex;align-items:center;gap:8px;padding:4px 10px;border:1px solid var(--dzmap-panel-border,#3f3f46);background:var(--dzmap-panel-bg,rgba(18,20,25,.92));color:var(--dzmap-text,#e7e7ea);font:400 11px/1.4 var(--dzmap-mono,ui-monospace,monospace);letter-spacing:.06em;pointer-events:none;white-space:nowrap}
.dzmap-coordinates[hidden]{display:none}
@media (pointer:coarse){.dzmap-coordinates-group{display:none}}
.dzmap-search{position:relative;width:min(300px,calc(100vw - 32px))}
.dzmap-search input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dzmap-control-border,#3f3f46);border-radius:var(--dzmap-radius,6px);background:var(--dzmap-control-bg,rgba(24,24,27,.9));color:var(--dzmap-text,#e7e7ea);font:inherit;font-size:13px;outline:none}
.dzmap-search input:focus{border-color:var(--dzmap-control-border-hover,#71717a)}
.dzmap-search ul{position:absolute;left:0;right:0;top:36px;z-index:30;margin:0;padding:4px 0;list-style:none;border:1px solid var(--dzmap-panel-border,#3f3f46);border-radius:var(--dzmap-radius,6px);background:var(--dzmap-panel-bg,rgba(18,20,25,.97));color:var(--dzmap-text,#e7e7ea);font-size:13px;max-height:320px;overflow:auto}
.dzmap-search ul[hidden]{display:none}
.dzmap-search li{padding:6px 10px;cursor:pointer}
.dzmap-search li[aria-selected=true],.dzmap-search li[role=option]:hover{background:rgba(255,255,255,.07)}
.dzmap-search li small{display:block;color:var(--dzmap-dim,#71717a);font-size:11px}
.dzmap-layers{position:relative}
.dzmap-layers-list{position:absolute;right:0;top:34px;z-index:30;min-width:180px;padding:8px 12px}
.dzmap-layers-list[hidden]{display:none}
.dzmap-layers-list label{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;white-space:nowrap}
.dzmap-layers-list input{accent-color:var(--dzmap-accent,#f26522)}
.dzmap-draw{position:absolute;inset:0;pointer-events:none!important;z-index:5}
.dzmap-draw>*{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;touch-action:none}
.dzmap-draw-corner{display:grid;place-items:center;width:40px;height:40px;cursor:grab}
.dzmap-draw-corner.dzmap-draw-grabbing{cursor:grabbing}
.dzmap-draw-corner span{display:block;box-sizing:border-box;width:12px;height:12px;border:2px solid #fff}
.dzmap-draw-corner.dzmap-draw-active span{width:16px;height:16px;background:#fff}
.dzmap-draw-edge{display:grid;place-items:center;width:32px;height:32px;cursor:copy}
.dzmap-draw-edge span{display:grid;place-items:center;box-sizing:border-box;width:14px;height:14px;border:1px solid rgba(255,255,255,.8);background:rgba(9,9,11,.8);color:#fff}
.dzmap-draw-edge svg{width:10px;height:10px}
.dzmap-draw-finger{width:44px;height:44px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);pointer-events:none!important}
.dzmap-draw-menu{transform:translateX(-50%)!important;border:1px solid var(--dzmap-panel-border,#3f3f46);background:var(--dzmap-panel-bg,rgba(9,9,11,.95))}
.dzmap-draw-menu button{display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:0;background:none;color:var(--dzmap-danger,#f87171);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.dzmap-draw-menu button:hover{background:rgba(248,113,113,.12)}
.dzmap-draw-menu svg{width:16px;height:16px}
.dzmap-draw-loupe{position:absolute;z-index:25;width:128px;height:128px;overflow:hidden;border:1px solid #f4f4f5;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);pointer-events:none}
.dzmap-draw-loupe::before,.dzmap-draw-loupe::after{content:"";position:absolute;z-index:30;left:50%;top:50%;background:#fff;transform:translate(-50%,-50%)}
.dzmap-draw-loupe::before{width:20px;height:1px}
.dzmap-draw-loupe::after{width:1px;height:20px}
.dzmap-select{height:28px;padding:0 8px;border:1px solid var(--dzmap-control-border,#3f3f46);border-radius:var(--dzmap-radius,6px);background:var(--dzmap-control-bg,rgba(24,24,27,.9));color:var(--dzmap-control-fg,#d4d4d8);font:inherit;font-size:12px}
`

export function injectStyles(doc: Document): void {
  if (doc.getElementById('dzmap-styles')) return
  const style = doc.createElement('style')
  style.id = 'dzmap-styles'
  style.textContent = CSS
  doc.head.prepend(style)
}

const NAMED_COLORS: Record<string, string> = {
  red: 'var(--dzmap-red,#fca5a5)',
  blue: 'var(--dzmap-blue,#93c5fd)',
  green: 'var(--dzmap-green,#22c55e)',
  yellow: 'var(--dzmap-yellow,#eab308)',
  orange: 'var(--dzmap-orange,#f97316)',
  purple: 'var(--dzmap-purple,#c084fc)',
  grey: 'var(--dzmap-grey,#a1a1aa)',
  gray: 'var(--dzmap-grey,#a1a1aa)',
  white: 'var(--dzmap-white,#fff)',
  black: 'var(--dzmap-black,#000)',
}

/** A CSS colour; the named map colours (`red`, `blue` …) follow the `--dzmap-<name>` variables. */
export function cssColor(color: string | undefined, fallback = 'grey'): string {
  const value = color ?? fallback
  return NAMED_COLORS[value.toLowerCase()] ?? value
}
