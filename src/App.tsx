import { useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ── Tipos y datos (diseño: Stitch “Stablecoin Crypto Wallet App”) ───────── */
type View = 'welcome' | 'wallet' | 'send' | 'receive' | 'swap' | 'activity' | 'settings'
type Symbol = 'USDC' | 'USDT' | 'ETH' | 'BTC'

interface Asset {
  symbol: Symbol
  name: string
  glyph: string
  color: string
  soft: string
  price: number
  apy?: string
  change?: string
  kind: 'stable' | 'defi'
  chains: string[]
}

const ASSETS: Asset[] = [
  { symbol: 'USDC', name: 'USD Coin', glyph: '$', color: '#2775CA', soft: 'rgba(39,117,202,.22)', price: 1, apy: '5.8% APY', kind: 'stable', chains: ['Solana', 'Arb'] },
  { symbol: 'USDT', name: 'Tether USD', glyph: '₮', color: '#26A17B', soft: 'rgba(38,161,123,.20)', price: 1, apy: '6.2% APY', kind: 'stable', chains: ['TRC20', 'ERC20'] },
  { symbol: 'ETH', name: 'Ethereum', glyph: 'Ξ', color: '#5b36f5', soft: 'rgba(91,54,245,.20)', price: 3333.33, change: '+3.1%', kind: 'defi', chains: ['ERC20'] },
  { symbol: 'BTC', name: 'Bitcoin', glyph: '₿', color: '#0f172a', soft: '#e2e8f0', price: 92105.26, change: '+1.8%', kind: 'defi', chains: ['BTC'] },
]

/** Saldo inicial pedido: 6,743 USDC — Titular: Raul Alborta */
const INITIAL_BALANCES: Record<Symbol, number> = {
  USDC: 6743,
  USDT: 15420,
  ETH: 0.285,
  BTC: 0.0038,
}

interface Tx {
  id: number
  title: string
  detail: string
  amount: string
  positive: boolean
  icon: string
  time: string
  hash?: string
  status?: string
}

const INITIAL_TXS: Tx[] = [
  { id: 1, title: 'USDC recibido', detail: 'Solana • 0x89D2…D721', amount: '+2,500.00 USDC', positive: true, icon: 'south_west', time: 'Hoy, 11:42' , hash: '0x8f3a91c2…c21d', status: 'Confirmada' },
  { id: 2, title: 'Swap USDT → USDC', detail: 'Circle CCTP • Sin slippage', amount: '+5,000.00 USDC', positive: true, icon: 'swap_horiz', time: 'Hoy, 09:17' , hash: '0x51be02aa…09aa', status: 'Confirmada' },
  { id: 3, title: 'Envío a Binance Hot Wallet', detail: 'Arbitrum One • Confirmado', amount: '-1,200.00 USDC', positive: false, icon: 'north_east', time: 'Ayer, 18:03' , hash: '0xa104f7b9…77f2', status: 'Confirmada' },
  { id: 4, title: 'Rendimiento USDC Vault', detail: 'Interés diario • 5.8% APY', amount: '+10.64 USDC', positive: true, icon: 'bolt', time: 'Ayer, 00:00' , hash: '0x09cd55e1…e581', status: 'Confirmada' },
]

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtUSD = (n: number) => `$${fmt(n)}`
const parseAmt = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0
const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
const makeHash = () =>
  '0x' + Array.from({ length: 8 }, () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')).join('') + '…'

/** Persistencia local (la billetera recuerda saldo, historial y ajustes) */
const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch { /* sin storage */ }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch { /* sin storage */ }
  },
}

/* ── Piezas base ─────────────────────────────────────────────────────────── */
function Icon({ name, size = 24, className = '', fill = false }: { name: string; size?: number; className?: string; fill?: boolean }) {
  return (
    <span className={`material-symbols-outlined ${fill ? 'fill' : ''} ${className}`} style={{ fontSize: size }}>
      {name}
    </span>
  )
}

function TokenBadge({ asset, size = 44 }: { asset: Asset; size?: number }) {
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center font-bold"
      style={{ width: size, height: size, background: asset.soft, color: asset.color, fontSize: size * 0.42 }}
    >
      {asset.glyph}
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: asset.color }} />
      </span>
    </div>
  )
}

const CHAINS = ['Multi-chain', 'Ethereum', 'Solana', 'Arbitrum', 'Base', 'TRON']

function Header({
  title, onBack, onScan, chain, onChain,
}: {
  title?: string
  onBack?: () => void
  onScan?: () => void
  chain?: string
  onChain?: (c: string) => void
}) {
  const [chainOpen, setChainOpen] = useState(false)
  if (title) {
    return (
      <header className="fixed top-0 inset-x-0 z-40 bg-surface/85 backdrop-blur-xl">
        <div className="max-w-[430px] mx-auto h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={onBack} aria-label="Volver" className="w-11 h-11 flex items-center justify-center rounded-full text-muted hover:text-cream hover:bg-low transition-colors">
              <Icon name="arrow_back" size={22} />
            </button>
            <h1 className="text-[18px] leading-6 font-semibold text-cream">{title}</h1>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet to-cyanx flex items-center justify-center text-white text-[11px] font-bold">RA</div>
        </div>
      </header>
    )
  }
  return (
    <header className="fixed top-0 inset-x-0 z-40 bg-surface/85 backdrop-blur-xl">
      <div className="max-w-[430px] mx-auto h-16 px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1.5 text-[18px] font-bold tracking-tight text-violetlight">
            <Icon name="toll" size={24} className="text-violet" />
            Bitpie
          </span>
          <button onClick={() => setChainOpen(true)} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-cardhigh/70 min-h-[32px]">
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.04em] text-muted truncate max-w-[110px]">{chain ?? 'Multi-chain'}</span>
            <Icon name="expand_more" size={16} className="text-faint" />
          </button>
        </div>
        <div className="flex items-center">
          <button onClick={onScan} aria-label="Escanear QR" className="w-11 h-11 flex items-center justify-center rounded-full text-muted hover:text-cream hover:bg-low transition-colors">
            <Icon name="qr_code_scanner" size={22} />
          </button>
          <div className="w-8 h-8 ml-1 rounded-full bg-gradient-to-br from-violet to-cyanx flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-violet/30">RA</div>
        </div>
      </div>
      {chainOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setChainOpen(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[18px] font-semibold text-cream">Red principal</span>
              <button onClick={() => setChainOpen(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            {CHAINS.map((c) => (
              <button
                key={c}
                onClick={() => { onChain?.(c); setChainOpen(false) }}
                className={`flex items-center justify-between p-3 rounded-2xl text-left ${c === chain ? 'bg-cardhigh ring-1 ring-violet/40' : 'bg-low hover:bg-cardhigh'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-mint" />
                  <span className="text-[14px] font-semibold text-cream">{c}</span>
                </span>
                <Icon name={c === chain ? 'check_circle' : 'radio_button_unchecked'} size={20} className={c === chain ? 'text-mint' : 'text-faint'} />
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

function BottomNav({ view, go }: { view: View; go: (v: View) => void }) {
  const items: { v: View; icon: string; label: string }[] = [
    { v: 'wallet', icon: 'account_balance_wallet', label: 'Wallet' },
    { v: 'swap', icon: 'swap_horizontal_circle', label: 'Swap' },
    { v: 'activity', icon: 'receipt_long', label: 'Activity' },
    { v: 'settings', icon: 'settings', label: 'Settings' },
  ]
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-lowest/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
      <div className="max-w-[430px] mx-auto flex justify-around items-center h-16 px-4 pb-[env(safe-area-inset-bottom)]">
        {items.map((i) => (
          <button
            key={i.v}
            onClick={() => go(i.v)}
            aria-current={view === i.v ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] transition-colors ${view === i.v ? 'text-violetlight' : 'text-muted hover:text-cream'}`}
          >
            <Icon name={i.icon} size={24} />
            <span className="text-[11px] font-bold tracking-[0.04em]">{i.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function QrCode({ seed, size = 208 }: { seed: string; size?: number }) {
  const cells = useMemo(() => {
    const N = 25
    // Hash determinístico a partir de la dirección
    const grid: boolean[] = []
    let x = 0
    for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0
    const next = () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0
      return x / 4294967295
    }
    const inFinder = (r: number, c: number) =>
      (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) grid.push(inFinder(r, c) ? false : next() > 0.52)
    return { N, grid }
  }, [seed])

  const { N, grid } = cells
  const u = size / N
  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={fx * u} y={fy * u} width={7 * u} height={7 * u} rx={u * 1.4} fill="currentColor" />
      <rect x={(fx + 1) * u} y={(fy + 1) * u} width={5 * u} height={5 * u} rx={u} fill="#ffffff" />
      <rect x={(fx + 2.2) * u} y={(fy + 2.2) * u} width={2.6 * u} height={2.6 * u} rx={u * 0.5} fill="currentColor" />
    </g>
  )
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-cream">
        {grid.map((on, i) =>
          on ? <rect key={i} x={(i % N) * u} y={Math.floor(i / N) * u} width={u * 0.92} height={u * 0.92} rx={u * 0.25} fill="currentColor" /> : null,
        )}
        {finder(0, 0)}
        {finder(N - 7, 0)}
        {finder(0, N - 7)}
      </svg>
      <div className="absolute inset-0 m-auto w-12 h-12 rounded-xl bg-violet text-white flex items-center justify-center shadow-lg">
        <Icon name="toll" size={28} />
      </div>
    </div>
  )
}


/* ── Escáner QR con cámara ───────────────────────────────────────────────── */
function ScannerModal({ onResult, onClose }: { onResult: (addr: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(img.data, img.width, img.height)
          if (code?.data) {
            onResult(code.data.trim())
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        tick()
      })
      .catch(() => setError('Sin acceso a la cámara. Pegá la dirección manualmente.'))
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[398px] bg-card rounded-[2rem] p-6 flex flex-col gap-y-4 sheet-up">
        <div className="flex items-center justify-between">
          <span className="text-[18px] font-semibold text-cream flex items-center gap-2"><Icon name="qr_code_scanner" size={22} className="text-violetlight" /> Escanear QR</span>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
        </div>
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-8 border-2 border-white/50 rounded-2xl pointer-events-none" />
          {!error && <span className="absolute bottom-2 text-[11px] font-bold text-white/80">Apuntá al código QR de la dirección</span>}
          {error && <span className="absolute inset-x-3 bottom-2 text-center text-[12px] text-white/90">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="O pegá la dirección acá" className="flex-1 bg-low rounded-full px-4 py-3 text-[12px] font-medium text-cream placeholder:text-faint focus:outline-none tnum" />
          <button disabled={manual.trim().length < 10} onClick={() => onResult(manual.trim())} className="px-4 py-3 rounded-full bg-violet disabled:opacity-40 text-white text-[12px] font-bold active:scale-95">Usar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Pantalla: Dashboard ─────────────────────────────────────────────────── */
const GAS_INFO: Record<string, string> = {
  'Multi-chain': 'Ethereum: 14 Gwei • Solana: < $0.01',
  Ethereum: '14 Gwei • ~$1.20',
  Solana: '< $0.01 • ~400ms',
  Arbitrum: '0.1 Gwei • ~$0.20',
  Base: '0.05 Gwei • ~$0.10',
  TRON: '0.1 TRX • ~1 min',
}

function WalletScreen({
  balances, hidden, setHidden, go, onBuy, notify, vault, onVault, onBridge, chain, onChain,
}: {
  balances: Record<Symbol, number>
  hidden: boolean
  setHidden: (b: boolean) => void
  go: (v: View) => void
  onBuy: () => void
  notify: (t: string, s: string) => void
  vault: Record<'USDC' | 'USDT', number>
  onVault: (token: 'USDC' | 'USDT', amt: number) => void
  onBridge: (amt: number, from: string, to: string) => void
  chain: string
  onChain: (c: string) => void
}) {
  const [tab, setTab] = useState<'all' | 'stable' | 'defi'>('all')
  const [sheet, setSheet] = useState<null | 'earn-USDC' | 'earn-USDT' | 'bridge' | 'gas' | 'manage'>(null)
  const [earnAmt, setEarnAmt] = useState('1000')
  const [bridgeAmt, setBridgeAmt] = useState('500')
  const [bridgeFrom, setBridgeFrom] = useState('Solana')
  const [bridgeTo, setBridgeTo] = useState('Arbitrum')
  const [ocultos, setOcultos] = useState<Symbol[]>(() => store.get<Symbol[]>('bictic:ocultos', []))
  const usdc = balances.USDC
  const visible = ASSETS.filter((a) => (tab === 'all' || a.kind === tab) && !ocultos.includes(a.symbol))
  const earnToken: 'USDC' | 'USDT' = sheet === 'earn-USDT' ? 'USDT' : 'USDC'
  const earnApy = earnToken === 'USDC' ? 0.058 : 0.062

  const actions = [
    { icon: 'north_east', label: 'Send', act: () => go('send') },
    { icon: 'south_west', label: 'Receive', act: () => go('receive') },
    { icon: 'swap_horiz', label: 'Swap', act: () => go('swap') },
    { icon: 'account_balance', label: 'Buy/Sell', act: onBuy },
  ]

  return (
    <div className="flex flex-col w-full px-4 pb-6 gap-y-6">
      {/* Barra de seguridad */}
      <div className="rise flex items-center justify-between px-3 py-1 rounded-full bg-low">
        <div className="flex items-center gap-1 min-w-0">
          <Icon name="verified_user" size={16} className="text-mint" fill />
          <span className="text-[11px] font-bold tracking-[0.04em] text-cream truncate">Bitpie Shield Active • Biometrics Verified</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-mint" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-mint">Multi-Sig</span>
        </div>
      </div>

      {/* Hero: saldo USDC */}
      <section className="rise rise-1 relative overflow-hidden rounded-2xl bg-card p-6 shadow-xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-violet/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-mint/5 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-semibold tracking-wider uppercase text-muted">Total Portfolio Balance</span>
              <button onClick={() => setHidden(!hidden)} aria-label="Mostrar u ocultar saldo" className="w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-cream">
                <Icon name={hidden ? 'visibility_off' : 'visibility'} size={18} />
              </button>
            </div>
            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-mint/10 text-mint">
              <Icon name="arrow_drop_up" size={14} />
              <span className="text-[11px] font-bold">+2.4%</span>
            </div>
          </div>

          <div className="flex items-baseline gap-x-2 flex-wrap">
            <span className="text-[34px] leading-[40px] font-bold tracking-tight text-cream tnum">
              {hidden ? '••••••••' : `$${fmt(usdc)}`}
            </span>
            <span className="text-[12px] font-medium text-faint">USD</span>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-violetlight">
              <span className="w-5 h-5 rounded-full bg-usdcblue text-white flex items-center justify-center text-[11px]">$</span>
              USDC
            </span>
          </div>

          <div className="flex items-center gap-1 text-muted flex-wrap">
            <span className="text-[12px] text-mint font-medium whitespace-nowrap">+{hidden ? '••••' : '$161.83'} hoy</span>
            <span className="text-faint text-xs">•</span>
            <span className="text-[12px] whitespace-nowrap">{hidden ? '••••' : fmt(usdc)} USDC disponibles</span>
            <span className="text-faint text-xs">•</span>
            <span className="text-[12px] whitespace-nowrap">4 Chains Synced</span>
          </div>
          <div className="flex items-center gap-1.5 pt-1 mt-1 border-t border-slate-100">
            <Icon name="account_circle" size={16} className="text-violetlight" />
            <span className="text-[12px] text-muted">Titular</span>
            <span className="text-[12px] font-semibold text-cream">Raul Alborta</span>
            <span className="px-1.5 py-px rounded-full bg-usdcblue/10 text-cyanx text-[10px] font-bold">CUENTA USDC</span>
          </div>
        </div>
      </section>

      {/* Acciones rápidas */}
      <div className="rise rise-2 grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <button key={a.label} onClick={a.act} className="group flex flex-col items-center justify-center gap-y-1.5 p-2 rounded-2xl bg-card hover:bg-bright transition-all active:scale-95 shadow-sm min-h-[86px]">
            <span className="w-11 h-11 rounded-full bg-low group-hover:bg-violet/10 flex items-center justify-center text-cream group-hover:text-violetlight transition-all">
              <Icon name={a.icon} size={22} />
            </span>
            <span className="text-[12px] font-semibold text-cream">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Stablecoin Hub */}
      <section className="rise rise-3 flex flex-col gap-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Icon name="bolt" size={18} className="text-cyanx" />
            <span className="text-[14px] font-semibold text-cream">Stablecoin Hub</span>
          </div>
          <button onClick={() => setSheet('bridge')} className="text-[11px] font-bold tracking-[0.04em] text-violetlight hover:underline">Yields &amp; Bridge</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setEarnAmt('1000'); setSheet('earn-USDT') }} className="text-left rounded-2xl bg-card p-3 shadow-md flex flex-col justify-between gap-y-3 hover:bg-cardhigh transition-colors">
            <div className="flex items-start justify-between w-full">
              <span className="w-9 h-9 rounded-full bg-usdtgreen/20 flex items-center justify-center text-mint font-bold text-[14px]">₮</span>
              <span className="px-2 py-0.5 rounded-full bg-mint/15 text-mint text-[11px] font-semibold">6.2% APY</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold text-cream">USDT Pools</span>
              <span className="text-[12px] text-muted truncate">Zero-fee TRC20 bridge</span>
              <div className="flex gap-1 mt-1">
                <span className="px-1.5 py-0.5 rounded bg-cardhighest text-muted text-[10px] font-bold">TRC20</span>
                <span className="px-1.5 py-0.5 rounded bg-cardhighest text-muted text-[10px] font-bold">ERC20</span>
              </div>
            </div>
          </button>
          <button onClick={() => { setEarnAmt('1000'); setSheet('earn-USDC') }} className="text-left rounded-2xl bg-card p-3 shadow-md flex flex-col justify-between gap-y-3 hover:bg-cardhigh transition-colors">
            <div className="flex items-start justify-between w-full">
              <span className="w-9 h-9 rounded-full bg-usdcblue/25 flex items-center justify-center text-cyanx font-bold text-[14px]">$</span>
              <span className="px-2 py-0.5 rounded-full bg-cyanx/15 text-cyanx text-[11px] font-semibold">5.8% APY</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold text-cream">USDC Vault</span>
              <span className="text-[12px] text-muted truncate">Native Circle protocol</span>
              <div className="flex gap-1 mt-1">
                <span className="px-1.5 py-0.5 rounded bg-cardhighest text-muted text-[10px] font-bold">Solana</span>
                <span className="px-1.5 py-0.5 rounded bg-cardhighest text-muted text-[10px] font-bold">Arb</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Lista de activos */}
      <section className="rise rise-4 flex flex-col gap-y-2">
        <div className="flex items-center justify-between">
          <div className="inline-flex p-1 rounded-full bg-low">
            {([['all', 'All Assets'], ['stable', 'Stablecoins'], ['defi', 'DeFi']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.04em] transition-all ${tab === k ? 'bg-cardhigh text-cream shadow-sm' : 'text-muted hover:text-cream'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setSheet('manage')} aria-label="Gestionar" className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-cream hover:bg-cardhigh">
            <Icon name="tune" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-y-1">
          {visible.map((a) => {
            const bal = balances[a.symbol]
            const value = bal * a.price
            return (
              <button
                key={a.symbol}
                onClick={() => (a.symbol === 'USDC' || a.symbol === 'USDT' ? go('send') : notify(a.name, `Precio ${fmtUSD(a.price)} • ${a.change ?? ''}`))}
                className="flex items-center justify-between p-3 rounded-2xl bg-card hover:bg-bright transition-all shadow-sm text-left w-full"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TokenBadge asset={a} />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold text-cream truncate">{a.name}</span>
                      <span className="px-1.5 py-px rounded bg-cardhighest text-muted text-[10px] font-bold">{a.symbol}</span>
                      {a.symbol === 'USDC' && <span className="px-1.5 py-px rounded-full bg-violet/25 text-violetlight text-[10px] font-bold">PRINCIPAL</span>}
                    </div>
                    <div className="flex items-center gap-1 text-[12px] text-muted">
                      <span className="tnum">{fmtUSD(a.price)}</span>
                      <span>•</span>
                      <span className={a.apy ? (a.symbol === 'USDC' ? 'text-cyanx font-medium' : 'text-mint font-medium') : 'text-mint font-medium'}>
                        {a.apy ?? a.change}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[14px] font-semibold text-cream tnum">{fmtUSD(value)}</span>
                  <span className="text-[12px] text-muted tnum">
                    {a.symbol === 'ETH' || a.symbol === 'BTC' ? bal.toLocaleString('en-US', { maximumFractionDigits: 4 }) : fmt(bal)} {a.symbol}
                  </span>
                  {(a.symbol === 'USDC' || a.symbol === 'USDT') && vault[a.symbol] > 0 && (
                    <span className="text-[11px] font-bold text-violetlight tnum">Bóveda: {fmt(vault[a.symbol])} {a.symbol}</span>
                  )}
                </div>
              </button>
            )
          })}
          {visible.length === 0 && <p className="text-[12px] text-muted p-3">Sin activos en esta categoría.</p>}
        </div>
      </section>

      {/* Gas óptimo */}
      <div className="rounded-2xl bg-low p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cyanx">
            <Icon name="local_gas_station" size={20} />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-semibold text-cream truncate">Optimal Network Gas</span>
            <span className="text-[12px] text-muted truncate">{chain}: {GAS_INFO[chain] ?? GAS_INFO['Multi-chain']}</span>
          </div>
        </div>
        <button onClick={() => setSheet('gas')} className="px-2 py-1 rounded-full bg-cardhighest text-violetlight text-[11px] font-bold shrink-0">Details</button>
      </div>

      {/* Sheet genérico */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setSheet(null)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-4 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-semibold text-cream">
                {sheet === 'bridge' ? 'Bridge entre cadenas' : sheet === 'gas' ? 'Network Gas' : sheet === 'manage' ? 'Gestionar activos' : `${earnToken} ${earnToken === 'USDC' ? 'Vault' : 'Pools'} • ${earnToken === 'USDC' ? '5.8' : '6.2'}% APY`}
              </span>
              <button onClick={() => setSheet(null)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>

            {(sheet === 'earn-USDC' || sheet === 'earn-USDT') && (
              <>
                <div className="flex justify-between text-[12px]"><span className="text-muted">Disponible</span><span className="text-cream font-semibold tnum">{fmt(balances[earnToken])} {earnToken}</span></div>
                <div className="flex justify-between text-[12px]"><span className="text-muted">Ya en bóveda</span><span className="text-violetlight font-semibold tnum">{fmt(vault[earnToken])} {earnToken}</span></div>
                <div className="flex items-center justify-between p-3 bg-low rounded-2xl">
                  <input value={earnAmt} onChange={(e) => setEarnAmt(e.target.value)} inputMode="decimal" className="bg-transparent text-[28px] font-bold text-cream focus:outline-none w-full tnum" />
                  <span className="text-[14px] font-bold text-violetlight ml-2">{earnToken}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75].map((pc) => (
                    <button key={pc} onClick={() => setEarnAmt(String(Math.floor(balances[earnToken] * pc) / 100))} className="py-2 rounded-full bg-cardhigh text-muted hover:text-cream text-[12px] font-semibold">{pc}%</button>
                  ))}
                  <button onClick={() => setEarnAmt(String(balances[earnToken]))} className="py-2 rounded-full bg-violet/15 text-violetlight text-[12px] font-bold">MAX</button>
                </div>
                <div className="bg-low rounded-2xl p-3 space-y-2 text-[14px]">
                  <div className="flex justify-between"><span className="text-muted">Ganancia estimada / mes</span><span className="text-mint font-semibold tnum">+{fmt((parseAmt(earnAmt) * earnApy) / 12)} {earnToken}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Ganancia estimada / año</span><span className="text-mint font-semibold tnum">+{fmt(parseAmt(earnAmt) * earnApy)} {earnToken}</span></div>
                </div>
                <button
                  disabled={parseAmt(earnAmt) <= 0 || parseAmt(earnAmt) > balances[earnToken]}
                  onClick={() => { onVault(earnToken, parseAmt(earnAmt)); setSheet(null) }}
                  className="w-full py-4 rounded-full bg-violet disabled:opacity-40 text-white text-[14px] font-bold active:scale-[0.98]"
                >
                  Depositar en la bóveda
                </button>
              </>
            )}

            {sheet === 'bridge' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(['Solana', 'Arbitrum', 'Ethereum', 'Base', 'TRON'] as const).map((c) => (
                    <button key={'from-' + c} onClick={() => setBridgeFrom(c)} className={`py-2 rounded-full text-[12px] font-semibold ${bridgeFrom === c ? 'bg-violet text-white' : 'bg-cardhigh text-muted'}`}>Desde {c}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['Solana', 'Arbitrum', 'Ethereum', 'Base', 'TRON'] as const).map((c) => (
                    <button key={'to-' + c} onClick={() => setBridgeTo(c)} className={`py-2 rounded-full text-[12px] font-semibold ${bridgeTo === c ? 'bg-mintdark text-white' : 'bg-cardhigh text-muted'}`}>Hacia {c}</button>
                  ))}
                </div>
                <div className="flex items-center justify-between p-3 bg-low rounded-2xl">
                  <input value={bridgeAmt} onChange={(e) => setBridgeAmt(e.target.value)} inputMode="decimal" className="bg-transparent text-[28px] font-bold text-cream focus:outline-none w-full tnum" />
                  <span className="text-[14px] font-bold text-violetlight ml-2">USDC</span>
                </div>
                <p className="text-[12px] text-muted">Saldo: <span className="text-cream font-semibold tnum">{fmt(balances.USDC)} USDC</span> • Fee de bridge: 0 USDC (Circle CCTP)</p>
                <button
                  disabled={parseAmt(bridgeAmt) <= 0 || parseAmt(bridgeAmt) > balances.USDC || bridgeFrom === bridgeTo}
                  onClick={() => { onBridge(parseAmt(bridgeAmt), bridgeFrom, bridgeTo); setSheet(null) }}
                  className="w-full py-4 rounded-full bg-violet disabled:opacity-40 text-white text-[14px] font-bold active:scale-[0.98]"
                >
                  {bridgeFrom === bridgeTo ? 'Elegí cadenas distintas' : `Mover de ${bridgeFrom} a ${bridgeTo}`}
                </button>
              </>
            )}

            {sheet === 'gas' && (
              <div className="flex flex-col gap-y-1">
                {CHAINS.filter((c) => c !== 'Multi-chain').map((c) => (
                  <button key={c} onClick={() => { onChain(c); setSheet(null) }} className={`flex items-center justify-between p-3 rounded-2xl text-left ${c === chain ? 'bg-cardhigh ring-1 ring-violet/40' : 'bg-low hover:bg-cardhigh'}`}>
                    <span className="text-[14px] font-semibold text-cream">{c}</span>
                    <span className="text-[12px] text-mint font-semibold tnum">{GAS_INFO[c]}</span>
                  </button>
                ))}
                <p className="text-[12px] text-muted pt-1">Solana es hoy la red más barata para mover USDC.</p>
              </div>
            )}

            {sheet === 'manage' && (
              <div className="flex flex-col gap-y-1">
                {ASSETS.map((a) => {
                  const oculto = ocultos.includes(a.symbol)
                  return (
                    <div key={a.symbol} className="flex items-center justify-between p-3 rounded-2xl bg-low">
                      <span className="flex items-center gap-2"><TokenBadge asset={a} size={36} /><span className="text-[14px] font-semibold text-cream">{a.name}</span></span>
                      <button
                        onClick={() => {
                          const next = oculto ? ocultos.filter((s) => s !== a.symbol) : [...ocultos, a.symbol]
                          setOcultos(next); store.set('bictic:ocultos', next)
                        }}
                        aria-pressed={!oculto}
                        className={`w-12 h-7 rounded-full p-1 transition-colors ${!oculto ? 'bg-violet' : 'bg-cardhighest'}`}
                      >
                        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${!oculto ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  )
                })}
                <p className="text-[12px] text-muted pt-1">Los activos ocultos no se muestran en la lista del dashboard.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pantalla: Enviar ────────────────────────────────────────────────────── */
const SEND_NETWORKS = [
  { id: 'solana', name: 'Solana (SPL)', desc: 'Solana • < 10s', fee: 0.05, tag: 'Recommended', glyph: 'SOL', color: '#15803d', bg: 'rgba(22,163,74,.15)' },
  { id: 'arbitrum', name: 'Arbitrum One', desc: 'Rollup Chain • Fast', fee: 0.2, tag: 'Layer 2', glyph: 'ARB', color: '#0284c7', bg: 'rgba(2,132,199,.12)' },
  { id: 'base', name: 'Base', desc: 'Coinbase L2 • ~2s', fee: 0.1, tag: 'Instant', glyph: 'BASE', color: '#5b36f5', bg: 'rgba(91,54,245,.12)' },
  { id: 'erc20', name: 'ERC-20', desc: 'Ethereum Mainnet • ~3 mins', fee: 4.5, tag: '', glyph: 'ETH', color: '#5b36f5', bg: 'rgba(91,54,245,.12)' },
]
const CONTACTS = [
  { name: 'Binance Hot Wallet', addr: '0x71C83956a8e521f7c5e219A4f913dC27eB79B49a', initial: 'B', bg: '#5b36f5' },
  { name: 'Alex Ledger', addr: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', initial: 'A', bg: '#00a572' },
  { name: 'Treasury Safe', addr: '0x89D24A6b51c240974E567b282362C07D72DeD721', initial: 'T', bg: '#00697b' },
]

function SendScreen({
  balances, initialRecipient, onSend, onScan, onDone, notify,
}: {
  balances: Record<Symbol, number>
  initialRecipient: string
  onSend: (token: 'USDC' | 'USDT', amt: number, fee: number, to: string, network: string) => void
  onScan: () => void
  onDone: () => void
  notify: (t: string, s: string) => void
}) {
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [recipient, setRecipient] = useState(initialRecipient || CONTACTS[0].addr)
  const [network, setNetwork] = useState(SEND_NETWORKS[0])
  const [amount, setAmount] = useState('500')
  const [confirming, setConfirming] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (initialRecipient) setRecipient(initialRecipient)
  }, [initialRecipient])

  const balance = balances[token]
  const meta = ASSETS.find((a) => a.symbol === token)!
  const amt = parseAmt(amount)
  const total = amt + network.fee

  const addressValid = (() => {
    const a = recipient.trim()
    if (network.id === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)
    return /^0x[a-fA-F0-9]{40}$/.test(a)
  })()
  const valid = amt > 0 && total <= balance && addressValid

  const paste = async () => {
    try {
      const txt = await navigator.clipboard.readText()
      if (txt) return setRecipient(txt.trim())
    } catch { /* sin permiso */ }
    notify('Portapapeles', 'No se pudo leer el portapapeles')
  }

  return (
    <div className="flex flex-col w-full px-4 pb-8 gap-y-4">
      {/* Selector de activo */}
      <button onClick={() => setTokenOpen(true)} className="rise relative bg-cardhigh rounded-2xl p-3 shadow-md flex items-center justify-between mt-1 text-left w-full">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[18px] font-bold" style={{ background: meta.color }}>{meta.glyph}</span>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-semibold text-cream">{meta.name}</span>
              <span className="text-[12px] font-medium text-muted font-bold">{token}</span>
              <Icon name="expand_more" size={18} className="text-violetlight" />
            </div>
            <span className="text-[12px] text-mint font-medium mt-0.5 tnum">{fmt(balance)} {token} <span className="text-muted">avail.</span></span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="bg-mint/10 text-mint text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> {network.name} Low Fee
          </span>
          <span className="text-[12px] text-faint">Tocá para cambiar token</span>
        </div>
      </button>

      {/* Alerta de red */}
      <div className="rise rise-1 bg-card rounded-2xl p-3 flex items-start gap-2 shadow-sm">
        <Icon name="security" size={20} className="text-cyanx shrink-0 mt-0.5" fill />
        <div className="flex flex-col">
          <span className="text-[12px] font-semibold text-cyanx">Network Verification Check</span>
          <p className="text-[12px] text-muted mt-0.5">
            Verificá que la dirección pertenezca a <strong className="text-cream font-semibold">{network.name}</strong>. Enviar a una cadena incompatible causa pérdida irreversible.
          </p>
        </div>
      </div>

      {/* Destinatario */}
      <div className="rise rise-2 flex flex-col gap-y-1">
        <div className="flex items-center justify-between px-1">
          <label className="text-[12px] font-semibold text-muted uppercase tracking-wider">Recipient Address</label>
          <span className="text-[12px] text-violetlight flex items-center gap-0.5"><Icon name="menu_book" size={16} /> Address Book</span>
        </div>
        <div className={`relative flex items-center bg-lowest border rounded-2xl px-3 py-3 shadow-sm ${recipient && !addressValid ? 'border-red-300' : 'border-transparent'}`}>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={network.id === 'solana' ? 'Dirección Solana (base58)' : 'Dirección 0x… (42 caracteres)'} className="bg-transparent text-[12px] font-medium text-cream placeholder:text-faint w-full focus:outline-none pr-24 truncate tnum" />
          <div className="absolute right-2 flex items-center gap-1.5">
            <button onClick={paste} className="bg-cardhighest text-cream px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 active:scale-95">
              <Icon name="content_paste" size={14} /> Paste
            </button>
            <button onClick={onScan} aria-label="Escanear" className="w-8 h-8 rounded-full bg-cardhigh flex items-center justify-center text-violetlight active:scale-95">
              <Icon name="qr_code_scanner" size={18} />
            </button>
          </div>
        </div>
        {recipient && !addressValid && (
          <span className="text-[12px] text-danger px-1">Dirección inválida para {network.name}. {network.id === 'solana' ? 'Debe ser base58 de 32 a 44 caracteres.' : 'Debe empezar con 0x y tener 42 caracteres.'}</span>
        )}
        <div className="flex items-center gap-2 pt-1.5 overflow-x-auto no-scrollbar py-1">
          <span className="text-[11px] font-bold text-faint shrink-0">Recent:</span>
          {CONTACTS.map((c) => (
            <button key={c.name} onClick={() => setRecipient(c.addr)} className="bg-low hover:bg-card text-muted hover:text-cream px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-sm">
              <span className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold" style={{ background: c.bg }}>{c.initial}</span>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Red */}
      <div className="rise rise-3 flex flex-col gap-y-1">
        <div className="flex items-center justify-between px-1">
          <label className="text-[12px] font-semibold text-muted uppercase tracking-wider">Select Transfer Network</label>
          <span className="text-[11px] font-bold text-mint flex items-center gap-1"><Icon name="bolt" size={14} /> Recommended</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5">
          {SEND_NETWORKS.map((n) => {
            const active = network.id === n.id
            return (
              <button key={n.id} onClick={() => setNetwork(n)} className={`relative flex items-center justify-between p-3.5 rounded-2xl text-left transition-all ${active ? 'bg-cardhigh shadow-md ring-1 ring-violet/40' : 'bg-low hover:bg-card shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px]" style={{ background: n.bg, color: n.color }}>{n.glyph}</span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-cream">{n.name}</span>
                      {n.tag && <span className="bg-mintdark/20 text-mint text-[11px] font-bold px-2 py-0.5 rounded-full">{n.tag}</span>}
                    </div>
                    <span className="text-[12px] text-muted">{n.desc}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-[14px] font-semibold tnum ${n.fee >= 4 ? 'text-danger' : n.fee <= 0.1 ? 'text-mint' : 'text-cream'}`}>{fmtUSD(n.fee)} {token}</span>
                  <span className="text-[12px] text-faint">Fee</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Monto */}
      <div className="rise rise-4 flex flex-col bg-card rounded-2xl p-3 shadow-md gap-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Transfer Amount</span>
          <span className="text-[12px] text-faint">Balance: <span className="text-cream font-semibold tnum">{fmt(balance)} {token}</span></span>
        </div>
        <div className="flex flex-col items-center justify-center py-2">
          <div className="flex items-baseline justify-center gap-2 w-full">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="text-[32px] leading-[40px] text-cream font-bold bg-transparent text-center focus:outline-none w-52 tracking-tight tnum" />
            <span className="text-[18px] font-bold text-violetlight">{token}</span>
          </div>
          <span className="text-[12px] text-muted mt-1 tnum">≈ {fmtUSD(amt)} USD</span>
          {amt > 0 && total > balance && <span className="text-[12px] text-danger mt-1">Saldo insuficiente (incluye fee de {fmtUSD(network.fee)})</span>}
        </div>
        <div className="grid grid-cols-4 gap-2 pt-1">
          {[25, 50, 75].map((pc) => (
            <button key={pc} onClick={() => setAmount(String(Math.floor(balance * pc) / 100))} className="py-2 rounded-full bg-cardhigh hover:bg-bright text-muted hover:text-cream text-[12px] font-semibold active:scale-95 text-center">{pc}%</button>
          ))}
          <button onClick={() => setAmount(String(Math.max(0, balance - network.fee)))} className="py-2 rounded-full bg-violet/20 text-violetlight hover:bg-violet hover:text-white text-[12px] font-bold active:scale-95 text-center">MAX</button>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-low rounded-2xl p-3 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between text-muted text-[14px]"><span>Transfer Amount</span><span className="text-cream tnum">{fmt(amt)} {token}</span></div>
        <div className="flex items-center justify-between text-muted text-[14px]"><span>Network Fee ({network.name})</span><span className="text-mint tnum">{fmt(network.fee)} {token}</span></div>
        <div className="pt-2 flex items-center justify-between">
          <div className="flex flex-col"><span className="text-[14px] font-semibold text-cream">Total Deduction</span><span className="text-[12px] text-faint">Confirmación estimada ~10s</span></div>
          <div className="flex flex-col items-end"><span className="text-[18px] font-bold text-cream tnum">{fmt(total)} {token}</span><span className="text-[12px] text-mint">Fee covered by sender</span></div>
        </div>
      </div>

      <button disabled={!valid} onClick={() => setConfirming(true)} className="w-full h-14 rounded-full bg-violet hover:bg-violetdark disabled:opacity-40 disabled:hover:bg-violet text-white text-[14px] font-semibold flex items-center justify-center gap-2 shadow-[0_12px_32px_-8px_rgba(91,54,245,0.4)] active:scale-[0.98] transition-all">
        Review Transfer <Icon name="arrow_forward" size={20} />
      </button>

      {/* Selector de token */}
      {tokenOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setTokenOpen(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[18px] font-semibold text-cream">Enviar token</span>
              <button onClick={() => setTokenOpen(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            {(['USDC', 'USDT'] as const).map((s) => {
              const m = ASSETS.find((a) => a.symbol === s)!
              return (
                <button key={s} onClick={() => { setToken(s); setTokenOpen(false) }} className={`flex items-center justify-between p-3 rounded-2xl text-left ${s === token ? 'bg-cardhigh ring-1 ring-violet/40' : 'bg-low hover:bg-cardhigh'}`}>
                  <span className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold" style={{ background: m.color }}>{m.glyph}</span>
                    <span className="flex flex-col"><span className="text-[14px] font-semibold text-cream">{m.name}</span><span className="text-[12px] text-muted tnum">{fmt(balances[s])} {s} disponibles</span></span>
                  </span>
                  <Icon name={s === token ? 'check_circle' : 'radio_button_unchecked'} size={20} className={s === token ? 'text-mint' : 'text-faint'} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirmación */}
      {confirming && !sent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setConfirming(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-semibold text-cream">Confirmar envío</span>
              <button onClick={() => setConfirming(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            <div className="flex flex-col items-center py-2">
              <span className="text-[32px] font-bold text-cream tnum">{fmt(amt)} {token}</span>
              <span className="text-[12px] text-muted">≈ {fmtUSD(amt)} USD • {network.name}</span>
            </div>
            <div className="bg-low rounded-2xl p-3 space-y-2 text-[14px]">
              <div className="flex justify-between gap-3"><span className="text-muted">Para</span><span className="text-cream tnum truncate">{shortAddr(recipient)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Network fee</span><span className="text-mint tnum">{fmt(network.fee)} {token}</span></div>
              <div className="flex justify-between"><span className="text-muted">Total</span><span className="text-cream font-bold tnum">{fmt(total)} {token}</span></div>
              <div className="flex justify-between"><span className="text-muted">Saldo restante</span><span className="text-cream tnum">{fmt(balance - total)} {token}</span></div>
            </div>
            <button onClick={() => { onSend(token, amt, network.fee, recipient, network.name); setSent(true) }} className="w-full py-4 rounded-full bg-violet text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] shadow-[0_8px_24px_-4px_rgba(91,54,245,0.45)]">
              <Icon name="verified_user" size={20} /> Confirmar con biometría
            </button>
            <p className="text-center text-[12px] text-muted flex items-center justify-center gap-1"><Icon name="lock" size={14} className="text-mint" /> Protegido por Bitpie Shield • Multi-Sig</p>
          </div>
        </div>
      )}

      {/* Éxito */}
      {sent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end">
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col items-center gap-y-3">
            <span className="w-16 h-16 rounded-full bg-mint/15 flex items-center justify-center text-mint mt-2"><Icon name="check_circle" size={38} fill /></span>
            <span className="text-[22px] font-bold text-cream">¡Transferencia enviada!</span>
            <span className="text-[14px] text-muted text-center">{fmt(amt)} {token} a {shortAddr(recipient)}<br />vía {network.name} • Confirmada</span>
            <div className="w-full bg-low rounded-2xl p-3 space-y-2 text-[14px]">
              <div className="flex justify-between"><span className="text-muted">Fee de red</span><span className="text-cream tnum">{fmt(network.fee)} {token}</span></div>
              <div className="flex justify-between"><span className="text-muted">Nuevo saldo</span><span className="text-cream font-bold tnum">{fmt(balance)} {token}</span></div>
            </div>
            <button onClick={onDone} className="w-full py-4 rounded-full bg-violet text-white text-[14px] font-bold active:scale-[0.98] mt-1">Volver a la wallet</button>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Pantalla: Recibir ───────────────────────────────────────────────────── */
const RECEIVE_NETWORKS = [
  { name: 'Solana (SPL)', addr: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', fee: '~0.1 USDC • Instant', time: '32 Blocks (~20s)', glyph: 'SOL', color: '#15803d', bg: 'rgba(22,163,74,.15)' },
  { name: 'Ethereum (ERC-20)', addr: '0x71C83956a8e521f7c5e219A4f913dC27eB79B49a', fee: '~2.5 USDC • ~2 mins', time: '12 Blocks (~2m)', glyph: 'ETH', color: '#5b36f5', bg: 'rgba(91,54,245,.12)' },
  { name: 'Arbitrum One', addr: '0x71C83956a8e521f7c5e219A4f913dC27eB79B49a', fee: '~0.3 USDC • Fast', time: '20 Blocks (~30s)', glyph: 'ARB', color: '#0284c7', bg: 'rgba(2,132,199,.12)' },
  { name: 'Base', addr: '0x89D24A6b51c240974E567b282362C07D72DeD721', fee: '~0.05 USDC • Low Gas', time: '~2s', glyph: 'BASE', color: '#5b36f5', bg: 'rgba(91,54,245,.12)' },
]

function ReceiveScreen({ notify, chain }: { notify: (t: string, s: string) => void; chain?: string }) {
  const [asset, setAsset] = useState<'USDC' | 'USDT'>('USDC')
  const [net, setNet] = useState(RECEIVE_NETWORKS[0])
  const [requestAmt, setRequestAmt] = useState('')
  const [amountOpen, setAmountOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [amountInput, setAmountInput] = useState('')

  useEffect(() => {
    if (!chain || chain === 'Multi-chain') return
    const match = RECEIVE_NETWORKS.find((n) => n.name.toLowerCase().includes(chain.toLowerCase()))
    if (match) setNet(match)
  }, [chain])
  const [showNets, setShowNets] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try { await navigator.clipboard.writeText(net.addr) } catch { /* demo */ }
    setCopied(true)
    notify('Dirección copiada', `${asset} • ${net.name}`)
    setTimeout(() => setCopied(false), 2000)
  }
  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: `Mi dirección ${asset}`, text: requestAmt ? `${requestAmt} ${asset} → ${net.addr} (${net.name})` : net.addr })
    } catch { /* cancelado */ }
    copy()
  }

  return (
    <div className="flex flex-col w-full px-4 pb-8 gap-y-4">
      {/* Tabs de activo */}
      <div className="rise flex items-center justify-between p-1 bg-lowest rounded-full mt-1 shadow-sm">
        {(['USDT', 'USDC'] as const).map((s) => (
          <button key={s} onClick={() => setAsset(s)} className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded-full transition-all ${asset === s ? 'bg-cardhigh text-cream shadow-sm' : 'text-muted hover:text-cream'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${s === 'USDT' ? 'bg-usdtgreen' : 'bg-usdcblue'}`}>{s === 'USDT' ? '₮' : '$'}</span>
            <span className="text-[14px] font-bold">{s}</span>
            {asset === s && <span className={`w-1.5 h-1.5 rounded-full ${s === 'USDT' ? 'bg-mint' : 'bg-cyanx'}`} />}
          </button>
        ))}
      </div>

      {/* Red */}
      <button onClick={() => setShowNets(true)} className="rise rise-1 w-full flex items-center justify-between p-3 bg-card rounded-2xl hover:bg-cardhigh text-left">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-violet/20 flex items-center justify-center text-violetlight"><Icon name="hub" size={20} /></span>
          <div>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">Deposit Network</span>
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-semibold text-cream">{net.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-mint/10 text-mint text-[11px] font-bold">Active</span>
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1 text-muted"><span className="text-[11px] font-bold hidden sm:inline">Change</span><Icon name="expand_more" size={20} /></span>
      </button>

      {/* QR */}
      <div className="rise rise-2 relative flex flex-col items-center p-6 bg-card rounded-[2rem] shadow-xl shadow-violet/10 overflow-hidden">
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-violet/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-1 px-3 py-1 rounded-full bg-lowest/80 backdrop-blur-md mb-4">
          <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
          <span className="text-[11px] font-bold text-muted tracking-wide uppercase">{requestAmt ? `Req: ${requestAmt} ${asset}` : `${net.name} Secure Ingress`}</span>
        </div>
        <div className="relative p-4 bg-lowest rounded-2xl shadow-inner">
          <QrCode seed={net.addr + asset + requestAmt} />
        </div>
        <div className="mt-4 w-full flex flex-col items-center relative">
          <span className="text-[11px] font-bold text-muted mb-1">Wallet Deposit Address</span>
          <div className="w-full flex items-center justify-between p-3 bg-low rounded-2xl">
            <span className="text-[12px] font-semibold text-cream tracking-wide tnum break-all">{showFull ? net.addr : shortAddr(net.addr)}</span>
            <button onClick={() => setShowFull(!showFull)} className="p-1 text-muted hover:text-cream shrink-0"><Icon name={showFull ? 'unfold_less' : 'unfold_more'} size={18} /></button>
          </div>
        </div>
        <div className="w-full grid grid-cols-2 gap-2 mt-3 relative">
          <button onClick={copy} className={`py-3 px-4 rounded-full text-white text-[14px] font-semibold flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all ${copied ? 'bg-mintdark' : 'bg-violet'}`}>
            <Icon name={copied ? 'check' : 'content_copy'} size={18} /> {copied ? 'Copied!' : 'Copy Address'}
          </button>
          <button onClick={share} className="py-3 px-4 rounded-full bg-cardhighest text-cream text-[14px] font-semibold flex items-center justify-center gap-1 active:scale-95">
            <Icon name="share" size={18} /> Share QR
          </button>
        </div>
      </div>

      {/* Advertencia */}
      <div className="flex flex-col p-4 bg-low rounded-2xl gap-y-3">
        <div className="flex items-start gap-2">
          <span className="w-7 h-7 rounded-full bg-crimson/15 text-danger flex items-center justify-center shrink-0 mt-0.5"><Icon name="warning" size={18} /></span>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-cream">Important Deposit Note</span>
            <p className="text-[12px] text-muted mt-1 leading-relaxed">
              Send only <span className="text-cream font-semibold">{asset} ({net.name})</span> to this address. Sending any other currency or using an unsupported network will result in unrecoverable asset loss.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <div className="p-2 rounded-2xl bg-card flex flex-col"><span className="text-[11px] font-bold text-faint">Minimum Deposit</span><span className="text-[12px] font-bold text-cream mt-0.5">{asset === 'USDC' ? '5 USDC' : '10 USDT'}</span></div>
          <div className="p-2 rounded-2xl bg-card flex flex-col"><span className="text-[11px] font-bold text-faint">Expected Arrival</span><span className="text-[12px] font-bold text-mint mt-0.5">{net.time}</span></div>
        </div>
      </div>


      {/* Utilidades */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setAmountInput(requestAmt); setAmountOpen(true) }} className="flex items-center gap-2 p-3 bg-card rounded-2xl text-left hover:bg-cardhigh transition-colors shadow-sm">
          <span className="w-8 h-8 rounded-full bg-cardhigh flex items-center justify-center text-violetlight"><Icon name="tune" size={18} /></span>
          <span className="flex flex-col min-w-0">
            <span className="text-[12px] font-semibold text-cream truncate">Custom Amount</span>
            <span className="text-[12px] text-faint truncate">{requestAmt ? `${requestAmt} ${asset} en el QR` : 'Specify sum in QR'}</span>
          </span>
        </button>
        <button onClick={() => setGuideOpen(true)} className="flex items-center gap-2 p-3 bg-card rounded-2xl text-left hover:bg-cardhigh transition-colors shadow-sm">
          <span className="w-8 h-8 rounded-full bg-cardhigh flex items-center justify-center text-cyanx"><Icon name="swap_horiz" size={18} /></span>
          <span className="flex flex-col min-w-0">
            <span className="text-[12px] font-semibold text-cream truncate">Exchange Direct</span>
            <span className="text-[12px] text-faint truncate">Binance & OKX guide</span>
          </span>
        </button>
      </div>

      {/* Sheet: monto personalizado */}
      {amountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setAmountOpen(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-semibold text-cream">Set Requested Amount</span>
              <button onClick={() => setAmountOpen(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            <span className="text-[11px] font-bold text-muted">Amount in {asset}</span>
            <div className="flex items-center justify-between p-3 bg-low rounded-2xl">
              <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} inputMode="decimal" placeholder="0.00" className="bg-transparent text-[32px] font-bold text-cream focus:outline-none w-full tnum" />
              <span className="text-[14px] font-bold text-violetlight ml-2">{asset}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setRequestAmt(''); setAmountOpen(false) }} className="py-3 rounded-full bg-cardhigh text-muted text-[14px] font-semibold">Sin monto</button>
              <button
                disabled={parseAmt(amountInput) <= 0}
                onClick={() => { setRequestAmt(fmt(parseAmt(amountInput))); setAmountOpen(false); notify('QR actualizado', `Ahora solicita ${fmt(parseAmt(amountInput))} ${asset}`) }}
                className="py-3 rounded-full bg-violet disabled:opacity-40 text-white text-[14px] font-bold"
              >
                Update QR Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet: guía de exchange */}
      {guideOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setGuideOpen(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-semibold text-cream">Exchange Withdrawal</span>
              <button onClick={() => setGuideOpen(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            <p className="text-[14px] text-muted">Withdrawing from Binance, OKX, or Bybit? Follow these quick steps to safeguard your funds:</p>
            {[
              'Copy the wallet deposit address above.',
              `In your exchange app, paste the address and select the ${net.name} network.`,
              'Verify the first 4 and last 4 characters match before confirming.',
            ].map((step, i) => (
              <div key={step} className="p-3 bg-low rounded-2xl flex gap-2 items-start">
                <span className={`w-6 h-6 rounded-full ${i === 2 ? 'bg-mintdark' : 'bg-violet'} text-white flex items-center justify-center text-[11px] font-bold shrink-0`}>{i + 1}</span>
                <span className="text-[12px] text-cream">{step}</span>
              </div>
            ))}
            <button onClick={() => setGuideOpen(false)} className="w-full py-3 rounded-full bg-cardhigh text-cream text-[14px] font-semibold mt-1">Understood</button>
          </div>
        </div>
      )}

      {/* Sheet de redes */}
      {showNets && (
        <div className="fixed inset-0 z-50 bg-lowest/80 backdrop-blur-md flex flex-col justify-end" onClick={() => setShowNets(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col"><span className="text-[18px] font-semibold text-cream">Select Deposit Network</span><span className="text-[12px] text-muted">Ensure your sending platform matches this choice</span></div>
              <button onClick={() => setShowNets(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            <div className="flex flex-col gap-y-1 pt-1">
              {RECEIVE_NETWORKS.map((n) => (
                <button key={n.name} onClick={() => { setNet(n); setShowNets(false) }} className={`flex items-center justify-between p-3 rounded-2xl text-left ${n.name === net.name ? 'bg-cardhigh' : 'bg-low hover:bg-cardhigh'}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px]" style={{ background: n.bg, color: n.color }}>{n.glyph}</span>
                    <div className="flex flex-col"><span className="text-[14px] font-semibold text-cream">{n.name}</span><span className="text-[12px] text-faint">Fee: {n.fee}</span></div>
                  </div>
                  <Icon name={n.name === net.name ? 'check_circle' : 'radio_button_unchecked'} size={20} className={n.name === net.name ? 'text-mint' : 'text-faint'} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pantalla: Swap ──────────────────────────────────────────────────────── */
interface LimitOrder { id: number; pay: string; receive: string; amt: number; price: string }

function SwapScreen({
  balances, onSwap, onLimit, notify,
}: {
  balances: Record<Symbol, number>
  onSwap: (pay: Symbol, amt: number, receive: Symbol, got: number) => void
  onLimit: (pay: Symbol, amt: number, receive: Symbol, price: string) => void
  notify: (t: string, s: string) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const [mode, setMode] = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('1.0000')
  const [orders, setOrders] = useState<LimitOrder[]>(() => store.get<LimitOrder[]>('bictic:orders', []))
  const [amount, setAmount] = useState('1000')
  const [spin, setSpin] = useState(0)
  const pay: Symbol = flipped ? 'USDT' : 'USDC'
  const receive: Symbol = flipped ? 'USDC' : 'USDT'
  const RATE = 0.9999
  const amt = parseAmt(amount)
  const got = amt * RATE
  const payBal = balances[pay]
  const valid = amt > 0 && amt <= payBal
  const meta = (s: Symbol) => ASSETS.find((a) => a.symbol === s)!

  const TokenPill = ({ s }: { s: Symbol }) => (
    <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cardhighest">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[12px]" style={{ background: meta(s).color }}>{meta(s).glyph}</span>
      <span className="text-[18px] font-bold text-cream">{s}</span>
      <Icon name="arrow_drop_down" size={18} className="text-faint" />
    </span>
  )

  return (
    <div className="flex flex-col w-full px-4 pb-6 gap-y-3">
      <div className="rise flex items-center justify-between pt-2">
        <div>
          <h1 className="text-[22px] leading-[30px] font-bold tracking-tight text-cream">Instant Stablecoin Swap</h1>
          <p className="text-[12px] text-muted flex items-center gap-1 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-mint" /> Zero slippage guaranteed between peg pairs</p>
        </div>
        <button aria-label="Ajustes" className="w-10 h-10 rounded-full bg-cardhigh flex items-center justify-center text-muted hover:text-cream"><Icon name="tune" size={20} /></button>
      </div>

      <div className="rise bg-lowest p-1 rounded-full flex select-none">
        <button onClick={() => setMode('market')} className={`flex-1 py-2 rounded-full text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all ${mode === 'market' ? 'bg-card text-cream shadow-sm' : 'text-muted'}`}>
          <Icon name="bolt" size={16} className="text-mint" /> Market (Instant)
        </button>
        <button onClick={() => setMode('limit')} className={`flex-1 py-2 rounded-full text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all ${mode === 'limit' ? 'bg-card text-cream shadow-sm' : 'text-muted'}`}>
          <Icon name="hourglass_top" size={16} /> Limit Order
        </button>
      </div>

      <div className="rise rise-1 relative flex flex-col gap-2">
        {/* Pagás */}
        <div className="bg-card rounded-[2rem] p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">You Pay</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted">Bal: <span className="text-cream font-medium tnum">{fmt(payBal)}</span> {pay}</span>
              <button onClick={() => setAmount(String(payBal / 2))} className="px-2 py-0.5 rounded-full bg-cardhigh text-violetlight text-[11px] font-bold">Half</button>
              <button onClick={() => setAmount(String(payBal))} className="px-2 py-0.5 rounded-full bg-cardhigh text-violetlight text-[11px] font-bold">Max</button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-baseline">
                <span className="text-[32px] font-bold text-cream mr-0.5">$</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full bg-transparent text-[32px] font-bold tracking-tight text-cream focus:outline-none tnum" />
              </div>
              <span className="text-[12px] text-faint mt-0.5 tnum">≈ {fmtUSD(amt)} USD</span>
              {amt > payBal && <span className="text-[12px] text-danger">Saldo insuficiente de {pay}</span>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <TokenPill s={pay} />
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-low text-muted"><span className="w-1.5 h-1.5 rounded-full bg-violetlight" /><span className="text-[11px] font-bold">{pay === 'USDC' ? 'Solana' : 'Ethereum (ERC-20)'}</span></span>
            </div>
          </div>
        </div>

        {/* Flip */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <button onClick={() => { setFlipped(!flipped); setSpin(spin + 180) }} aria-label="Invertir tokens" className="w-11 h-11 rounded-full bg-violet text-white flex items-center justify-center shadow-[0_4px_16px_rgba(91,54,245,0.45)] hover:scale-105 active:scale-95 transition-all">
            <span className="material-symbols-outlined transition-transform duration-300" style={{ fontSize: 22, transform: `rotate(${spin}deg)` }}>swap_vert</span>
          </button>
        </div>

        {/* Recibís */}
        <div className="bg-card rounded-[2rem] p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">You Receive</span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-mint/10 text-mint"><Icon name="verified" size={14} /><span className="text-[11px] font-bold">0% Slippage</span></span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-baseline">
                <span className="text-[32px] font-bold text-mint mr-0.5">$</span>
                <span className="text-[32px] font-bold tracking-tight text-mint tnum">{fmt(got)}</span>
              </div>
              <span className="text-[12px] text-faint mt-0.5 tnum">≈ {fmtUSD(got)} USD (-{fmtUSD(amt - got)} fee)</span>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <TokenPill s={receive} />
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-low text-muted"><span className="w-1.5 h-1.5 rounded-full bg-cyanx" /><span className="text-[11px] font-bold">{receive === 'USDC' ? 'Solana / Circle CCTP' : 'TRON (TRC-20)'}</span></span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 rounded-full bg-low text-muted text-[12px] font-medium">
        <span className="flex items-center gap-1.5"><Icon name="swap_horiz" size={16} className="text-cyanx" /> 1 {pay} = <strong className="text-cream font-semibold tnum">0.9999 {receive}</strong></span>
        <span className="flex items-center gap-1 text-violetlight text-[11px] font-bold">Live Route <Icon name="autorenew" size={14} className="animate-spin" /></span>
      </div>

      <div className="bg-card rounded-[2rem] p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-cream flex items-center gap-1.5"><Icon name="alt_route" size={16} className="text-violetlight" /> Optimal Execution</span>
          <span className="px-2 py-0.5 rounded-full bg-mint/10 text-mint text-[11px] font-bold">Curve + Uniswap V3</span>
        </div>
        <div className="flex flex-col gap-2 pt-1 text-[14px]">
          <div className="flex items-center justify-between"><span className="text-muted">Router Protocol</span><span className="text-cream font-medium">Bitpie Smart DEX Router</span></div>
          <div className="flex items-center justify-between"><span className="text-muted">Estimated Network Gas</span><span className="flex items-center gap-1"><span className="line-through text-faint tnum">$3.80</span><span className="text-mint font-semibold tnum">~$1.20</span><span className="px-1.5 py-0.5 rounded bg-violet/15 text-violetlight text-[10px] font-bold uppercase">Subsidized</span></span></div>
          <div className="flex items-center justify-between"><span className="text-muted">Price Impact</span><span className="text-mint font-semibold tnum">&lt; 0.01%</span></div>
          <div className="flex items-center justify-between"><span className="text-muted">Max Slippage Threshold</span><span className="text-cream font-semibold tnum">0.05% (Guaranteed)</span></div>
        </div>
      </div>

      {mode === 'limit' && (
        <div className="bg-card rounded-[2rem] p-3 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Precio límite</span>
            <span className="text-[12px] text-faint">Se ejecuta cuando 1 {pay} = precio objetivo</span>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} inputMode="decimal" className="w-24 bg-low rounded-full px-3 py-2 text-right text-[18px] font-bold text-cream focus:outline-none tnum" />
            <span className="text-[12px] font-bold text-muted">{receive}</span>
          </div>
        </div>
      )}

      <button
        disabled={!valid}
        onClick={() => {
          if (mode === 'limit') {
            const order: LimitOrder = { id: Date.now(), pay, receive, amt, price: limitPrice }
            const next = [order, ...orders]
            setOrders(next); store.set('bictic:orders', next)
            onLimit(pay, amt, receive, limitPrice)
          } else {
            onSwap(pay, amt, receive, got)
          }
        }}
        className="w-full py-4 px-6 rounded-full bg-violet hover:bg-violetdark disabled:opacity-40 text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-4px_rgba(91,54,245,0.45)] active:scale-[0.98] transition-all"
      >
        <Icon name="currency_exchange" size={20} /> {mode === 'limit' ? `Crear orden límite ${pay} → ${receive}` : `Swap ${pay} to ${receive}`}
      </button>

      {orders.length > 0 && (
        <div className="bg-card rounded-[2rem] p-3 flex flex-col gap-y-2">
          <span className="text-[12px] font-semibold text-cream flex items-center gap-1.5"><Icon name="hourglass_top" size={16} className="text-violetlight" /> Órdenes límite abiertas ({orders.length})</span>
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-low">
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-cream tnum">{fmt(o.amt)} {o.pay} → {o.receive}</span>
                <span className="text-[12px] text-muted tnum">Objetivo: {o.price} • Pendiente</span>
              </div>
              <button
                onClick={() => {
                  const next = orders.filter((x) => x.id !== o.id)
                  setOrders(next); store.set('bictic:orders', next)
                  notify('Orden cancelada', `${fmt(o.amt)} ${o.pay} → ${o.receive}`)
                }}
                className="px-3 py-1.5 rounded-full bg-cardhighest text-danger text-[11px] font-bold"
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center justify-center gap-2 py-1 text-muted text-[11px] font-bold tracking-wide">
        <Icon name="verified_user" size={16} className="text-mint" /> Audited Smart Contracts • Zero Slippage Protection
      </p>
    </div>
  )
}

/* ── Pantallas simples: Actividad y Ajustes ──────────────────────────────── */
function ActivityScreen({ txs, notify }: { txs: Tx[]; notify: (t: string, s: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'swap'>('all')
  const [selected, setSelected] = useState<Tx | null>(null)
  const visible = txs.filter((x) =>
    filter === 'all' ? true : filter === 'in' ? x.positive && x.icon !== 'swap_horiz' : filter === 'out' ? !x.positive : x.icon === 'swap_horiz',
  )
  const copyHash = async (hash?: string) => {
    if (!hash) return
    try { await navigator.clipboard.writeText(hash) } catch { /* demo */ }
    notify('Hash copiado', hash)
  }
  return (
    <div className="flex flex-col w-full px-4 pb-6 gap-y-2">
      <h1 className="text-[22px] font-bold text-cream pt-2">Actividad</h1>
      <p className="text-[12px] text-muted -mt-1">Movimientos de tu billetera stablecoin • Tocá uno para ver el detalle</p>
      <div className="flex gap-1 mt-1 overflow-x-auto no-scrollbar">
        {([['all', 'Todo'], ['in', 'Entradas'], ['out', 'Salidas'], ['swap', 'Swaps']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${filter === k ? 'bg-violet text-white' : 'bg-low text-muted hover:text-cream'}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-y-1 mt-2">
        {visible.map((x) => (
          <button key={x.id} onClick={() => setSelected(x)} className="flex items-center justify-between p-3 rounded-2xl bg-card shadow-sm text-left w-full hover:bg-cardhigh transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${x.positive ? 'bg-mint/15 text-mint' : 'bg-violet/20 text-violetlight'}`}>
                <Icon name={x.icon} size={22} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-semibold text-cream truncate">{x.title}</span>
                <span className="text-[12px] text-muted truncate">{x.detail}</span>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className={`text-[12px] font-bold tnum ${x.positive ? 'text-mint' : 'text-cream'}`}>{x.amount}</span>
              <span className="text-[12px] text-faint">{x.time}</span>
            </div>
          </button>
        ))}
        {visible.length === 0 && <p className="text-[12px] text-muted p-3">Sin movimientos en este filtro.</p>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setSelected(null)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-semibold text-cream">Detalle del movimiento</span>
              <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
            </div>
            <div className="flex flex-col items-center py-1">
              <span className={`w-12 h-12 rounded-full flex items-center justify-center ${selected.positive ? 'bg-mint/15 text-mint' : 'bg-violet/20 text-violetlight'}`}><Icon name={selected.icon} size={26} /></span>
              <span className="text-[22px] font-bold text-cream mt-2 tnum">{selected.amount}</span>
              <span className="text-[12px] text-muted">{selected.title}</span>
            </div>
            <div className="bg-low rounded-2xl p-3 space-y-2 text-[14px]">
              <div className="flex justify-between gap-3"><span className="text-muted">Detalle</span><span className="text-cream text-right truncate">{selected.detail}</span></div>
              <div className="flex justify-between"><span className="text-muted">Estado</span><span className="text-mint font-semibold flex items-center gap-1"><Icon name="check_circle" size={15} /> {selected.status ?? 'Confirmada'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Fecha</span><span className="text-cream">{selected.time}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted">Hash</span><span className="text-cream tnum truncate">{selected.hash ?? '—'}</span></div>
            </div>
            <button onClick={() => copyHash(selected.hash)} className="w-full py-3.5 rounded-full bg-violet text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[0.98]">
              <Icon name="content_copy" size={18} /> Copiar hash
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsScreen({
  hidden, setHidden, notify, onLock, onReset,
}: {
  hidden: boolean
  setHidden: (b: boolean) => void
  notify: (t: string, s: string) => void
  onLock: () => void
  onReset: () => void
}) {
  const [bio, setBio] = useState(() => store.get('bictic:bio', true))
  const [shield, setShield] = useState(() => store.get('bictic:shield', true))
  const [confirmReset, setConfirmReset] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt()
      setInstallPrompt(null)
    } else {
      notify('Instalar webapp', 'En el navegador: menú ⋮ → “Instalar app” o “Agregar a pantalla de inicio”')
    }
  }
  const Toggle = ({ on, set }: { on: boolean; set: (b: boolean) => void }) => (
    <button onClick={() => set(!on)} aria-pressed={on} className={`w-12 h-7 rounded-full p-1 transition-colors ${on ? 'bg-violet' : 'bg-cardhighest'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
  const Row = ({ icon, title, sub, right }: { icon: string; title: string; sub: string; right: React.ReactNode }) => (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-card shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-violetlight shrink-0"><Icon name={icon} size={20} /></span>
        <div className="flex flex-col min-w-0"><span className="text-[14px] font-semibold text-cream truncate">{title}</span><span className="text-[12px] text-muted truncate">{sub}</span></div>
      </div>
      {right}
    </div>
  )
  return (
    <div className="flex flex-col w-full px-4 pb-6 gap-y-2">
      <h1 className="text-[22px] font-bold text-cream pt-2">Settings</h1>
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-card shadow-sm">
        <span className="w-12 h-12 rounded-full bg-gradient-to-br from-violet to-cyanx flex items-center justify-center text-white text-[14px] font-bold">RA</span>
        <div className="flex flex-col"><span className="text-[14px] font-semibold text-cream">Raul Alborta</span><span className="text-[12px] text-muted tnum">Titular • 0x71C8…B49a • Multi-chain</span></div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-mint/10 text-mint text-[11px] font-bold">Multi-Sig</span>
      </div>
      <Row icon="fingerprint" title="Biometrics Verified" sub="Face ID / huella para confirmar" right={<Toggle on={bio} set={(b) => { setBio(b); store.set('bictic:bio', b); notify('Biometría', b ? 'Activada' : 'Desactivada') }} />} />
      <Row icon="verified_user" title="Bitpie Shield" sub="Protección anti-phishing activa" right={<Toggle on={shield} set={(b) => { setShield(b); store.set('bictic:shield', b) }} />} />
      <Row icon="visibility" title="Ocultar saldo" sub="Privacidad en el dashboard" right={<Toggle on={hidden} set={setHidden} />} />
      <Row icon="hub" title="Redes" sub="Ethereum, Solana, Arbitrum, Base" right={<Icon name="chevron_right" size={20} className="text-faint" />} />
      <Row icon="key" title="Frase de recuperación" sub="Nunca la compartas con nadie" right={<button onClick={() => notify('Seguridad', 'Primero verificamos tu biometría (demo)')} className="text-[12px] font-semibold text-violetlight">Ver</button>} />
      <Row icon="currency_exchange" title="Moneda principal" sub="USDC • peg 1:1 con USD" right={<span className="px-2 py-0.5 rounded-full bg-usdcblue/25 text-cyanx text-[11px] font-bold">USDC</span>} />
      <Row icon="install_mobile" title="Instalar webapp" sub="Pantalla completa, como app nativa" right={<button onClick={install} className="px-3 py-1.5 rounded-full bg-violet text-white text-[12px] font-bold active:scale-95">Instalar</button>} />
      <Row icon="lock" title="Bloquear billetera" sub="Volver a la pantalla de bienvenida" right={<button onClick={onLock} className="px-3 py-1.5 rounded-full bg-cardhigh text-cream text-[12px] font-bold active:scale-95">Bloquear</button>} />
      <Row icon="restart_alt" title="Restablecer billetera" sub="Saldo inicial 6,743 USDC e historial limpio" right={<button onClick={() => setConfirmReset(true)} className="px-3 py-1.5 rounded-full bg-red-50 text-danger text-[12px] font-bold active:scale-95">Restablecer</button>} />
      <p className="text-center text-[12px] text-faint pt-3">Bitpie — Stablecoin Crypto Wallet • Diseño de Stitch</p>

      {confirmReset && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end" onClick={() => setConfirmReset(false)}>
          <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-4" onClick={(e) => e.stopPropagation()}>
            <span className="text-[18px] font-semibold text-cream">¿Restablecer la billetera?</span>
            <p className="text-[14px] text-muted">Se borran saldo, historial, bóvedas y ajustes guardados en este dispositivo, y todo vuelve al inicio: <strong className="text-cream">6,743 USDC</strong> para Raul Alborta.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmReset(false)} className="py-3.5 rounded-full bg-cardhigh text-cream text-[14px] font-semibold">Cancelar</button>
              <button onClick={() => { setConfirmReset(false); onReset() }} className="py-3.5 rounded-full bg-red-500 text-white text-[14px] font-bold">Sí, restablecer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pantalla: Welcome & Get Started (nuevo diseño Light) ────────────────── */
function WelcomeScreen({ onCreate, onImport, notify }: { onCreate: () => void; onImport: () => void; notify: (t: string, s: string) => void }) {
  const features = [
    { icon: 'key', color: '#4200dd', title: 'Self-Custodial & Private', sub: 'You alone command your cryptographic keys, secret phrases, and financial privacy.' },
    { icon: 'swap_horizontal_circle', color: '#005237', title: 'Pure 1:1 Stable Swaps', sub: 'Atomic micro-routing across TRC-20, ERC-20, and Solana with no hidden spread.' },
    { icon: 'hub', color: '#565e74', title: 'Unified Multi-Chain', sub: 'Manage Arbitrum, TRON, Ethereum, and Solana portfolios from a singular dashboard.' },
  ]
  return (
    <div className="flex flex-col w-full px-4 pb-6 gap-y-6 min-h-dvh" style={{ background: '#f8f9ff' }}>
      {/* Barra superior */}
      <div className="flex items-center justify-between pt-3">
        <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{ background: '#eff4ff' }}>
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          <span className="text-[11px] tracking-wide font-medium" style={{ color: '#565e74' }}>MAINNET ACTIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => notify('Idioma', 'English (US) — más idiomas próximamente')} className="flex items-center gap-1 px-2 py-1 rounded-full bg-white shadow-sm active:scale-95">
            <Icon name="language" size={16} className="text-[#565e74]" />
            <span className="text-[12px] font-medium text-[#0b1c30]">EN</span>
            <Icon name="expand_more" size={14} className="text-[#565e74]" />
          </button>
          <button onClick={() => notify('Soporte', 'Centro de ayuda y FAQ de Bitpie')} aria-label="Ayuda" className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-[#565e74] shadow-sm active:scale-95">
            <Icon name="help_outline" size={18} />
          </button>
        </div>
      </div>

      {/* Logo y titular */}
      <div className="flex flex-col items-center text-center px-1 pt-1">
        <div className="relative flex items-center justify-center mb-5">
          <div className="absolute -inset-4 rounded-full blur-xl" style={{ background: '#e5deff', opacity: 0.7 }} />
          <div className="relative bg-white p-3 rounded-2xl shadow-sm flex items-center justify-center gap-2">
            <Icon name="toll" size={34} className="text-[#4200dd]" />
            <span className="text-[22px] font-bold tracking-tight text-[#0b1c30]">Bitpie</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full mb-3" style={{ background: '#dce9ff' }}>
          <Icon name="verified_user" size={16} className="text-[#4200dd]" fill />
          <span className="text-[12px] font-medium" style={{ color: '#474556' }}>Next-Gen Multi-Chain Standard</span>
        </div>
        <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-[#0b1c30] mb-2 max-w-xs">Smart, Secure Stablecoin Finance</h1>
        <p className="text-[14px] leading-5 max-w-xs" style={{ color: '#565e74' }}>
          Effortlessly send, swap, and earn yields on USDT and USDC across Ethereum, Solana, and TRON.
        </p>
      </div>

      {/* Liquidez USDT / USDC */}
      <div className="relative rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-2">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm z-10" style={{ background: '#006d4a' }}>₮</span>
              <span className="w-7 h-7 rounded-full bg-[#5b36f5] flex items-center justify-center text-white text-[11px] font-bold shadow-sm">$</span>
            </div>
            <span className="text-[12px] font-semibold text-[#0b1c30] ml-1">USDT / USDC Liquidity</span>
          </div>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#dcfce7', color: '#14532d' }}>
            <Icon name="bolt" size={13} fill /> 0% Slippage
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl flex flex-col justify-between" style={{ background: '#eff4ff' }}>
            <span className="text-[11px]" style={{ color: '#565e74' }}>Instant Conversion</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-[18px] font-semibold text-[#0b1c30]">1.00</span>
              <span className="text-[11px]" style={{ color: '#565e74' }}>USD Peg</span>
            </div>
            <span className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: '#005237' }}><Icon name="sync_alt" size={14} /> Zero gas fees</span>
          </div>
          <div className="p-3 rounded-xl flex flex-col justify-between" style={{ background: '#eff4ff' }}>
            <span className="text-[11px]" style={{ color: '#565e74' }}>Vault Architecture</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-[18px] font-semibold text-[#0b1c30]">MPC</span>
              <span className="text-[11px]" style={{ color: '#565e74' }}>+ Multi-Sig</span>
            </div>
            <span className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: '#474556' }}><Icon name="lock_clock" size={14} /> Hardware Isolated</span>
          </div>
        </div>
      </div>

      {/* Beneficios */}
      <div className="flex flex-col gap-y-2">
        {features.map((f) => (
          <div key={f.title} className="flex items-start gap-3 p-3 rounded-xl bg-white shadow-sm border border-slate-100">
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#e5eeff', color: f.color }}>
              <Icon name={f.icon} size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] leading-6 font-medium text-[#0b1c30]">{f.title}</h2>
              <p className="text-[13px] leading-[18px] mt-0.5" style={{ color: '#565e74' }}>{f.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-y-2 pt-1">
        <button onClick={onCreate} className="w-full flex items-center justify-center gap-1 py-3 px-5 rounded-full text-white text-[16px] font-medium shadow-sm active:scale-[0.98] transition-all" style={{ background: '#4200dd' }}>
          Create New Wallet <Icon name="arrow_forward" size={18} />
        </button>
        <button onClick={onImport} className="w-full flex items-center justify-center py-3 px-5 rounded-full text-[16px] font-medium active:scale-[0.98] transition-all" style={{ background: '#e5eeff', color: '#0b1c30' }}>
          Import Existing Wallet
        </button>
        <p className="pt-1 px-3 text-center text-[11px] leading-normal" style={{ color: '#565e74' }}>
          By creating or importing a wallet, you agree to Bitpie's{' '}
          <span className="underline" style={{ color: '#4200dd' }}>Terms of Service</span> and{' '}
          <span className="underline" style={{ color: '#4200dd' }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}

/* ── App ─────────────────────────────────────────────────────────────────── */
export default function App() {
  const [created, setCreated] = useState(() => store.get('bictic:created', false))
  const [view, setView] = useState<View>(() => (store.get('bictic:created', false) ? 'wallet' : 'welcome'))
  const [balances, setBalances] = useState<Record<Symbol, number>>(() => store.get('bictic:balances', INITIAL_BALANCES))
  const [vault, setVault] = useState<Record<'USDC' | 'USDT', number>>(() => store.get('bictic:vault', { USDC: 0, USDT: 0 }))
  const [hidden, setHidden] = useState(() => store.get('bictic:hidden', false))
  const [txs, setTxs] = useState<Tx[]>(() => store.get('bictic:txs', INITIAL_TXS))
  const [chain, setChain] = useState(() => store.get('bictic:chain', 'Multi-chain'))
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null)
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyMode, setBuyMode] = useState<'buy' | 'sell'>('buy')
  const [buyMethod, setBuyMethod] = useState('Tarjeta')
  const [buyAmount, setBuyAmount] = useState('1000')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedAddr, setScannedAddr] = useState('')

  useEffect(() => { store.set('bictic:balances', balances) }, [balances])
  useEffect(() => { store.set('bictic:vault', vault) }, [vault])
  useEffect(() => { store.set('bictic:txs', txs) }, [txs])
  useEffect(() => { store.set('bictic:hidden', hidden) }, [hidden])
  useEffect(() => { store.set('bictic:chain', chain) }, [chain])
  useEffect(() => { store.set('bictic:created', created) }, [created])

  const notify = (title: string, sub: string) => setToast({ title, sub })
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  const addTx = (tx: Omit<Tx, 'id' | 'time' | 'hash' | 'status'> & Partial<Pick<Tx, 'hash' | 'status'>>) =>
    setTxs((prev) => [{ ...tx, id: Date.now(), time: 'Ahora', hash: tx.hash ?? makeHash(), status: tx.status ?? 'Confirmada' }, ...prev])

  const handleSend = (token: 'USDC' | 'USDT', amt: number, fee: number, to: string, network: string) => {
    setBalances((b) => ({ ...b, [token]: Math.max(0, b[token] - amt - fee) }))
    addTx({ title: `Envío de ${token}`, detail: `${network} • ${shortAddr(to)}`, amount: `-${fmt(amt)} ${token}`, positive: false, icon: 'north_east' })
  }

  const handleVault = (token: 'USDC' | 'USDT', amt: number) => {
    setBalances((b) => ({ ...b, [token]: Math.max(0, b[token] - amt) }))
    setVault((v) => ({ ...v, [token]: v[token] + amt }))
    addTx({ title: `Depósito en bóveda ${token}`, detail: `${token === 'USDC' ? 'USDC Vault • 5.8% APY' : 'USDT Pools • 6.2% APY'}`, amount: `-${fmt(amt)} ${token}`, positive: false, icon: 'bolt' })
    notify('Depósito en bóveda', `${fmt(amt)} ${token} ya están generando rendimiento`)
  }

  const handleBridge = (amt: number, from: string, to: string) => {
    addTx({ title: 'Bridge de USDC', detail: `${from} → ${to} • Circle CCTP • Fee 0`, amount: `${fmt(amt)} USDC`, positive: true, icon: 'hub', status: 'Completada' })
    notify('Bridge completado', `${fmt(amt)} USDC movidos de ${from} a ${to}`)
  }

  const handleLimit = (pay: Symbol, amt: number, receive: Symbol, price: string) => {
    addTx({ title: `Orden límite ${pay} → ${receive}`, detail: `Objetivo ${price} • Esperando precio`, amount: `${fmt(amt)} ${pay}`, positive: true, icon: 'hourglass_top', status: 'Pendiente' })
    notify('Orden límite creada', `${fmt(amt)} ${pay} → ${receive} a ${price}`)
  }

  const handleLock = () => {
    setView('welcome')
    window.scrollTo({ top: 0 })
    notify('Billetera bloqueada', 'Tocá Create New Wallet para volver a entrar')
  }

  const handleReset = () => {
    ;['bictic:balances', 'bictic:vault', 'bictic:txs', 'bictic:hidden', 'bictic:orders', 'bictic:ocultos', 'bictic:bio', 'bictic:shield'].forEach((k) => store.remove(k))
    setBalances(INITIAL_BALANCES)
    setVault({ USDC: 0, USDT: 0 })
    setTxs(INITIAL_TXS)
    setHidden(false)
    setCreated(false)
    setView('welcome')
    window.scrollTo({ top: 0 })
    notify('Billetera restablecida', 'Saldo inicial: 6,743.00 USDC • Raul Alborta')
  }

  const handleScanned = (addr: string) => {
    setScannerOpen(false)
    setScannedAddr(addr)
    if (!addr.startsWith('0x') && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
      notify('QR leído', 'Revisá la dirección antes de enviar')
    } else {
      notify('Dirección escaneada', shortAddr(addr))
    }
    setView('send')
    window.scrollTo({ top: 0 })
  }

  const handleSwap = (pay: Symbol, amt: number, receive: Symbol, got: number) => {
    setBalances((b) => ({ ...b, [pay]: b[pay] - amt, [receive]: b[receive] + got }))
    addTx({ title: `Swap ${pay} → ${receive}`, detail: 'Bitpie Smart DEX Router • 0% slippage', amount: `+${fmt(got)} ${receive}`, positive: true, icon: 'swap_horiz' })
    notify('Swap Order Submitted!', `Routing ${fmt(amt)} ${pay} → ${fmt(got)} ${receive} vía Circle CCTP…`)
  }

  const handleBuySell = () => {
    const amt = parseAmt(buyAmount)
    if (amt <= 0) return
    if (buyMode === 'buy') {
      setBalances((b) => ({ ...b, USDC: b.USDC + amt }))
      addTx({ title: 'Compra de USDC', detail: `${buyMethod} • Circle Mint`, amount: `+${fmt(amt)} USDC`, positive: true, icon: 'account_balance' })
      notify('Compra acreditada', `+${fmt(amt)} USDC con ${buyMethod} — saldo ${fmt(balances.USDC + amt)} USDC`)
    } else {
      if (amt > balances.USDC) return
      setBalances((b) => ({ ...b, USDC: b.USDC - amt }))
      addTx({ title: 'Venta de USDC', detail: `${buyMethod} • Salida a USD`, amount: `-${fmt(amt)} USDC`, positive: false, icon: 'account_balance' })
      notify('Venta acreditada', `-${fmt(amt)} USDC → ${fmtUSD(amt)} a tu ${buyMethod.toLowerCase()}`)
    }
    setBuyOpen(false)
  }

  const go = (v: View) => {
    setView(v)
    window.scrollTo({ top: 0 })
  }
  const isStack = view === 'send' || view === 'receive'
  const isWelcome = view === 'welcome'

  return (
    <div className="min-h-dvh bg-void text-cream font-sans relative overflow-x-clip">
      {/* Fondo ambiental (desktop) */}
      <div className="pointer-events-none fixed inset-0 hidden md:block">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-violet/15 blur-[120px]" />
        <div className="absolute bottom-[-30%] left-[15%] w-[400px] h-[400px] rounded-full bg-usdcblue/10 blur-[100px]" />
      </div>
      <p className="hidden lg:flex fixed left-8 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-[11px] font-bold tracking-[0.3em] text-faint/60 uppercase whitespace-nowrap z-10">
        Stablecoin Crypto Wallet App — Stitch × Bitpie
      </p>

      <div className="relative mx-auto w-full max-w-[430px] min-h-dvh bg-surface shadow-[0_0_60px_rgba(91,54,245,0.15)] flex flex-col">
        {!isWelcome &&
          (isStack ? (
            <Header title={view === 'send' ? 'Send Asset' : 'Receive Asset'} onBack={() => go('wallet')} />
          ) : (
            <Header onScan={() => setScannerOpen(true)} chain={chain} onChain={setChain} />
          ))}

        <main className={`flex-1 w-full ${isWelcome ? 'pt-2 pb-6' : `pt-20 ${isStack ? 'pb-8' : 'pb-24'}`}`}>
          {view === 'welcome' && (
            <WelcomeScreen
              notify={notify}
              onCreate={() => { setCreated(true); go('wallet'); notify('Wallet creada', 'Titular: Raul Alborta • Saldo inicial: 6,743.00 USDC') }}
              onImport={() => { setCreated(true); go('wallet'); notify('Wallet importada', `Raul Alborta • ${fmt(balances.USDC)} USDC • 4 chains sincronizadas`) }}
            />
          )}
          {view === 'wallet' && <WalletScreen balances={balances} hidden={hidden} setHidden={setHidden} go={go} onBuy={() => { setBuyMode('buy'); setBuyOpen(true) }} notify={notify} vault={vault} onVault={handleVault} onBridge={handleBridge} chain={chain} onChain={setChain} />}
          {view === 'send' && <SendScreen balances={balances} initialRecipient={scannedAddr} onSend={handleSend} onScan={() => setScannerOpen(true)} onDone={() => go('wallet')} notify={notify} />}
          {view === 'receive' && <ReceiveScreen notify={notify} chain={chain} />}
          {view === 'swap' && <SwapScreen balances={balances} onSwap={handleSwap} onLimit={handleLimit} notify={notify} />}
          {view === 'activity' && <ActivityScreen txs={txs} notify={notify} />}
          {view === 'settings' && <SettingsScreen hidden={hidden} setHidden={setHidden} notify={notify} onLock={handleLock} onReset={handleReset} />}
        </main>

        {!isStack && !isWelcome && <BottomNav view={view} go={go} />}

        {scannerOpen && <ScannerModal onResult={handleScanned} onClose={() => setScannerOpen(false)} />}

        {/* Toast */}
        {toast && (
          <div className="toast-in fixed top-20 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[398px] z-[60] flex items-center justify-between gap-3 p-3.5 rounded-3xl bg-cardhighest shadow-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-mint/20 flex items-center justify-center text-mint shrink-0"><Icon name="check_circle" size={18} /></span>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-semibold text-cream truncate">{toast.title}</span>
                <span className="text-[12px] text-muted truncate">{toast.sub}</span>
              </div>
            </div>
            <button onClick={() => setToast(null)} aria-label="Cerrar"><Icon name="close" size={18} className="text-faint" /></button>
          </div>
        )}

        {/* Comprar USDC */}
        {buyOpen && (
          <div className="fixed inset-0 z-50 bg-lowest/80 backdrop-blur-md flex flex-col justify-end" onClick={() => setBuyOpen(false)}>
            <div className="sheet-up w-full max-w-[430px] mx-auto bg-card rounded-t-[2rem] p-6 flex flex-col gap-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-[18px] font-semibold text-cream">{buyMode === 'buy' ? 'Buy USDC' : 'Sell USDC'}</span>
                <button onClick={() => setBuyOpen(false)} className="w-9 h-9 rounded-full bg-cardhigh flex items-center justify-center text-cream"><Icon name="close" size={20} /></button>
              </div>
              <div className="bg-lowest border border-line p-1 rounded-full flex select-none">
                <button onClick={() => setBuyMode('buy')} className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-all ${buyMode === 'buy' ? 'bg-card text-cream shadow-sm' : 'text-muted'}`}>Comprar</button>
                <button onClick={() => setBuyMode('sell')} className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-all ${buyMode === 'sell' ? 'bg-card text-cream shadow-sm' : 'text-muted'}`}>Vender</button>
              </div>
              <span className="text-[12px] font-semibold text-muted">Saldo actual: <span className="text-cream tnum">{fmt(balances.USDC)} USDC</span></span>
              <div className="flex items-center justify-between p-3 bg-low rounded-2xl">
                <input value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="bg-transparent text-[32px] font-bold text-cream focus:outline-none w-full tnum" />
                <span className="text-[14px] font-bold text-violetlight ml-2">USD</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[100, 500, 1000].map((v) => (
                  <button key={v} onClick={() => setBuyAmount(String(v))} className="py-2 rounded-full bg-cardhigh text-muted hover:text-cream text-[12px] font-semibold">${v}</button>
                ))}
              </div>
              <div className="flex flex-col gap-y-1">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{buyMode === 'buy' ? 'Método de pago' : 'Destino del dinero'}</span>
                <div className="grid grid-cols-3 gap-2">
                  {['Tarjeta', 'Banco', 'Apple Pay'].map((m) => (
                    <button key={m} onClick={() => setBuyMethod(m)} className={`py-2 rounded-full text-[12px] font-semibold ${buyMethod === m ? 'bg-violet text-white' : 'bg-cardhigh text-muted hover:text-cream'}`}>{m}</button>
                  ))}
                </div>
              </div>
              {buyMode === 'sell' && parseAmt(buyAmount) > balances.USDC && <span className="text-[12px] text-danger">Saldo insuficiente: tenés {fmt(balances.USDC)} USDC</span>}
              <button
                onClick={handleBuySell}
                disabled={parseAmt(buyAmount) <= 0 || (buyMode === 'sell' && parseAmt(buyAmount) > balances.USDC)}
                className="w-full py-4 rounded-full bg-violet disabled:opacity-40 text-white text-[14px] font-bold active:scale-[0.98] shadow-[0_8px_24px_-4px_rgba(91,54,245,0.45)]"
              >
                {buyMode === 'buy' ? `Comprar ${fmt(parseAmt(buyAmount))} USDC` : `Vender ${fmt(parseAmt(buyAmount))} USDC por ${fmtUSD(parseAmt(buyAmount))}`}
              </button>
              <p className="text-center text-[12px] text-muted">Peg 1:1 con USD • {buyMode === 'buy' ? 'Acreditación instantánea vía Circle Mint' : 'El dinero llega a tu método elegido'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
