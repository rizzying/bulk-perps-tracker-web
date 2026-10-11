import { create } from "zustand";
import { client, BulkError } from "./api/client";
import { FullAccount, TFullAccount, TTicker } from "./api/types";
import { BulkSocket } from "./api/ws";
import { syncFunding, loadCache, TFunding } from "./funding";
import { onAccountEvent } from "./alerts";

export type Wallet = { address: string; label: string };
type AcctState = { data?: TFullAccount; error?: string; updated?: number; parent?: string };
type S = {
  wallets: Wallet[];
  accounts: Record<string, AcctState>;
  marks: Record<string, number>;
  live: boolean;
  funding: Record<string, TFunding[]>;
  fundingLoading: boolean;
  refreshFunding: () => Promise<void>;
  addWallet: (address: string, label?: string) => Promise<string | null>;
  removeWallet: (address: string) => void;
  refreshAll: () => Promise<void>;
};
const KEY = "bpt.wallets.v1";
const load = (): Wallet[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const save = (w: Wallet[]) => localStorage.setItem(KEY, JSON.stringify(w));
export const isPubkey = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

let sock: BulkSocket | null = null;

export const useStore = create<S>((set, get) => {
  const setAcct = (addr: string, patch: AcctState) => set((s) => ({ accounts: { ...s.accounts, [addr]: { ...s.accounts[addr], ...patch } } }));

  const watchSymbols = () => {
    const syms = new Set<string>();
    Object.values(get().accounts).forEach((a) => a.data?.positions.forEach((p) => syms.add(p.symbol)));
    syms.add("BTC-USD"); // always on: Pulse shows it, and it keeps the stale-socket watchdog fed
    syms.forEach((symbol) => sock?.subscribe({ type: "ticker", symbol }));
  };

  async function loadAccount(addr: string, parent?: string) {
    try {
      const data = await client.fullAccount(addr);
      setAcct(addr, { data, error: undefined, updated: Date.now(), parent });
      sock?.subscribe({ type: "account", user: addr });
      if (!parent) for (const sub of data.subAccounts) await loadAccount(sub.pubkey, addr);
    } catch (e) {
      const msg = e instanceof BulkError && e.code === "ACCOUNT_NOT_FOUND" ? "No Bulk account found for this address yet" : String((e as Error).message);
      setAcct(addr, { error: msg, updated: Date.now(), parent });
    }
  }

  // Ticker messages arrive several times per second per symbol: batch them so the UI re-renders at most ~2×/s.
  const pendingMarks: Record<string, number> = {}; let marksTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleMarks = () => { if (marksTimer) return; marksTimer = setTimeout(() => { marksTimer = null; const p = { ...pendingMarks }; for (const k in pendingMarks) delete pendingMarks[k]; set((s) => ({ marks: { ...s.marks, ...p } })); }, 500); };
  const onMsg = (m: any) => {
    if (m.type === "ticker") { const t = m.data?.ticker as TTicker; if (t && Number.isFinite(t.markPrice)) { pendingMarks[t.symbol] = t.markPrice; scheduleMarks(); } return; }
    if (m.type === "account" && typeof m.topic === "string") {
      const addr = m.topic.slice("account.".length); const d = m.data;
      if (d?.type === "accountSnapshot") {
        const r = FullAccount.safeParse(d);
        if (r.success) { setAcct(addr, { data: r.data, updated: Date.now(), error: undefined }); watchSymbols(); }
      }
      if (["liquidation", "adl", "fill"].includes(d?.type)) onAccountEvent(addr, d);
      if (["fill", "positionUpdate", "marginUpdate", "liquidation", "adl"].includes(d?.type)) {
        // Incremental events: simplest correct approach for MVP is a debounced REST resync.
        debouncedResync(addr);
      }
    }
  };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const debouncedResync = (addr: string) => {
    clearTimeout(timers.get(addr));
    timers.set(addr, setTimeout(() => loadAccount(addr, get().accounts[addr]?.parent), 750));
  };

  if (typeof window !== "undefined" && typeof WebSocket !== "undefined") {
    sock = new BulkSocket(onMsg, () => get().refreshAll());
    sock.start(); setTimeout(() => set({ live: true }), 0); setTimeout(() => sock?.subscribe({ type: "ticker", symbol: "BTC-USD" }), 0);
    setInterval(() => get().refreshAll(), 60_000); // safety net
    const isPulse = new URLSearchParams(location.search).get("view") === "pulse";
    if (!isPulse) { setInterval(() => get().refreshFunding(), 10 * 60_000); setTimeout(() => get().refreshFunding(), 4000); }
    // Wallet list changed in another window (e.g. added in main while Pulse is open): reload and resync.
    window.addEventListener("storage", (e) => { if (e.key === KEY) { set({ wallets: load() }); void get().refreshAll(); } });
    setTimeout(() => watchSymbols(), 0);
    setTimeout(() => get().refreshAll(), 0);
  }

  return {
    wallets: load(), accounts: {}, marks: {}, live: false, funding: {}, fundingLoading: false,
    async refreshFunding() {
      set({ fundingLoading: true });
      const addrs = Object.keys(get().accounts).filter((a) => get().accounts[a].data);
      for (const a of addrs) { try { const r = await syncFunding(a); set((s) => ({ funding: { ...s.funding, [a]: r } })); } catch { set((s) => ({ funding: { ...s.funding, [a]: loadCache(a) } })); } }
      set({ fundingLoading: false });
    },
    async addWallet(address, label) {
      address = address.trim();
      if (!isPubkey(address)) return "That doesn't look like a Solana/Bulk wallet address.";
      if (get().wallets.some((w) => w.address === address)) return "Already added.";
      const wallets = [...get().wallets, { address, label: label?.trim() || `Wallet ${get().wallets.length + 1}` }];
      save(wallets); set({ wallets });
      await loadAccount(address); watchSymbols();
      return null;
    },
    removeWallet(address) {
      const wallets = get().wallets.filter((w) => w.address !== address); save(wallets);
      const accounts = { ...get().accounts };
      for (const [k, v] of Object.entries(accounts)) if (k === address || v.parent === address) { delete accounts[k]; sock?.unsubscribe({ type: "account", user: k }); }
      const funding = { ...get().funding }; for (const k of Object.keys(funding)) if (!accounts[k]) delete funding[k];
      set({ wallets, accounts, funding });
    },
    async refreshAll() { for (const w of get().wallets) await loadAccount(w.address); watchSymbols(); },
  };
});
