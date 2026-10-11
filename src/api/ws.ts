import { WS } from "./client";
// One shared socket. Re-subscribes and fires onReconnect (caller resyncs via REST) after drops.
type Handler = (msg: any) => void;
export class BulkSocket {
  private ws: WebSocket | null = null;
  private subs = new Map<string, object>();
  private backoff = 1000;
  private closed = false;
  private lastMsg = Date.now();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  constructor(private onMsg: Handler, private onReconnect: () => void, private url = WS) {}
  start() {
    this.closed = false; this.connect();
    // Stale-connection watchdog: the BTC ticker streams several msgs/s, so 60 s of silence means a dead socket.
    this.watchdog = setInterval(() => { if (!this.closed && Date.now() - this.lastMsg > 60_000) { this.lastMsg = Date.now(); this.ws?.close(); } }, 15_000);
  }
  stop() { this.closed = true; if (this.watchdog) clearInterval(this.watchdog); this.ws?.close(); }
  private key(s: any) { return `${s.type}.${s.user ?? s.symbol ?? ""}${s.interval ? "." + s.interval : ""}`; }
  subscribe(s: object) { const k = this.key(s); if (this.subs.has(k)) return; this.subs.set(k, s); this.send({ method: "subscribe", subscription: [s] }); }
  unsubscribe(s: object) { const k = this.key(s); if (!this.subs.delete(k)) return; this.send({ method: "unsubscribe", subscription: [s] }); }
  private send(m: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  private connect() {
    const ws = new WebSocket(this.url); this.ws = ws; let opened = false;
    ws.onopen = () => {
      if (this.backoff > 1000 || opened) this.onReconnect();
      opened = true; this.backoff = 1000;
      if (this.subs.size) ws.send(JSON.stringify({ method: "subscribe", subscription: [...this.subs.values()] }));
    };
    ws.onmessage = (e) => { this.lastMsg = Date.now(); try { this.onMsg(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
      const wait = this.backoff * (0.5 + Math.random()); this.backoff = Math.min(30000, this.backoff * 2);
      setTimeout(() => this.connect(), wait);
    };
  }
}
