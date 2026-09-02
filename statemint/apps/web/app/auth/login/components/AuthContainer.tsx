'use client'

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";

export default function AuthContainer() {
  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Background Glow */}
      <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[180px]" />
      <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-emerald-400/10 blur-[200px]" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10">

        <div
          className="grid w-full max-w-7xl overflow-hidden rounded-[32px] lg:grid-cols-[1fr_520px]"
          style={{
            border: '1px solid var(--border-2)',
            background: 'var(--surface)',
            boxShadow: '0 40px 120px rgba(0,0,0,.35)',
          }}
        >
          <LeftPanel />
          <RightPanel />
        </div>

      </div>
    </main>
  );
}