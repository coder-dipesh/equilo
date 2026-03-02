import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars -- motion.span / motion.div used in JSX
import { motion } from 'framer-motion';
import { Users, Receipt, Building2, ArrowRight, CircleDollarSign, Scale, Wallet, CheckCircle2, BarChart3, Percent, History, Plus, Menu, X } from 'lucide-react';

const WORD_STAGGER_S = 0.14;

const viewportOnce = { once: true, amount: 0.12 };
const slideUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};
const staggerContainer = {
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

function AnimatedWords({ text, className = '', baseDelay = 0, gradient = false, gradientStartIndex = 0 }) {
  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = 6;
  return (
    <span className={className}>
      {words.map((word, i) => {
        const idx = gradientStartIndex + i;
        const bgPos = totalWords > 1 ? `${(idx / (totalWords - 1)) * 100}%` : '0%';
        return (
          <span
            key={`${word}-${i}`}
            className={`hero-word ${gradient ? 'hero-word-gradient' : ''}`}
            style={{
              animationDelay: `${baseDelay + i * WORD_STAGGER_S}s`,
              ...(gradient ? { '--hero-grad-pos': bgPos } : {}),
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-pattern-equilo text-text-primary flex flex-col">
      {/* Navigation – blends into hero background */}
      <header className="sticky top-0 z-30 relative bg-pattern-equilo">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-10">
          {/* Left: logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src="../src/assets/logo/app_icon.svg" alt="Equilo" className="w-8 h-8" />
            <span className="text-body-lg font-semibold tracking-tight text-text-primary leading-none">
              Equilo
            </span>
          </Link>

          {/* Center: pill navigation – desktop only */}
          <div className="hidden md:flex">
            <div className="inline-flex items-center gap-6 rounded-full bg-surface/90 px-6 py-3 text-sm font-medium text-text-secondary border border-border shadow-card">
              <button
                type="button"
                className="hover:text-text-primary transition-colors"
                onClick={() => document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Overview
              </button>
              <button
                type="button"
                className="hover:text-text-primary transition-colors"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                How it works
              </button>
              <button
                type="button"
                className="hover:text-text-primary transition-colors"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Features
              </button>
              <button
                type="button"
                className="hover:text-text-primary transition-colors"
                onClick={() => document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Testimonials
              </button>
              
            </div>
          </div>

          {/* Right: auth actions – desktop only */}
          <div className="hidden md:flex items-center gap-5">
            <Link to="/login" className="text-sm font-medium text-primary hover:underline no-underline">
              Sign in
            </Link>
            <Link
              to="/register"
              className="group btn btn-primary rounded-full px-5 py-2.5 min-h-12 sm:min-h-0 gap-0 group-hover:gap-2 no-underline inline-flex items-center transition-transform duration-200 hover:scale-105 transition-[gap] duration-200"
            >
              Get started for free
              <ArrowRight
                className="w-0 min-w-0 overflow-hidden opacity-0 -translate-x-1 group-hover:w-4 group-hover:min-w-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0"
                aria-hidden
              />
            </Link>
          </div>

          {/* Hamburger – mobile only */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden flex h-12 w-12 items-center justify-center rounded-lg text-text-primary hover:bg-base-200 aria-expanded={mobileMenuOpen}"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
          </button>
        </nav>

        {/* Mobile menu panel – always in DOM for animation */}
        <div
          className={`md:hidden absolute left-0 right-0 top-full z-20 border-t border-border bg-pattern-equilo backdrop-blur overflow-hidden transition-all duration-300 ease-out ${
            mobileMenuOpen ? 'max-h-[70vh] opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
            <div className="mx-auto max-w-6xl px-6 py-4 space-y-1">
              <button
                type="button"
                className="block w-full text-left py-3 px-3 rounded-lg text-sm font-medium text-text-primary hover:bg-base-200"
                onClick={() => { document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
              >
                Overview
              </button>
              <button
                type="button"
                className="block w-full text-left py-3 px-3 rounded-lg text-sm font-medium text-text-primary hover:bg-base-200"
                onClick={() => { document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
              >
                How it works
              </button>
              <button
                type="button"
                className="block w-full text-left py-3 px-3 rounded-lg text-sm font-medium text-text-primary hover:bg-base-200"
                onClick={() => { document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
              >
                Features
              </button>
              <button
                type="button"
                className="block w-full text-left py-3 px-3 rounded-lg text-sm font-medium text-text-primary hover:bg-base-200"
                onClick={() => { document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' }); setMobileMenuOpen(false); }}
              >
                Testimonials
              </button>
              
              <div className="border-t border-border pt-3 mt-3">
                <Link
                  to="/login"
                  className="block py-3 px-3 rounded-lg text-sm font-medium text-primary hover:bg-base-200 no-underline"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="mt-2 flex items-center justify-center gap-2 min-h-12 rounded-full btn btn-primary text-sm font-semibold no-underline"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get started for free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero – centered, matching reference layout */}
       {/* Hero – centered, with subtle left/right fillers */}
<section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 lg:px-8 sm:pb-24 lg:pb-28">
  {/* Soft blobs – same gradient both sides so left/right color is even */}
  <div className="pointer-events-none absolute -left-48 -top-48 hidden lg:block" >
    <svg width="520" height="520" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blurL" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="56" />
        </filter>
        <linearGradient id="gL" x1="120" y1="80" x2="420" y2="460" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0967F7" stopOpacity="0.08" />
          <stop offset="0.6" stopColor="#5969AB" stopOpacity="0.05" />
          <stop offset="1" stopColor="#F3F6FC" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path
        filter="url(#blurL)"
        d="M332 66c62 22 104 85 96 155-7 60-56 98-78 151-26 61 2 105-57 131-67 29-161 6-212-48-48-51-47-130-21-190 25-59 83-83 124-128 44-49 82-92 148-71z"
        fill="url(#gL)"
      />
    </svg>
  </div>

  <div className="pointer-events-none absolute -right-56 -top-40 hidden lg:block" >
    <svg width="520" height="520" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blurR" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="56" />
        </filter>
        <linearGradient id="gR" x1="420" y1="80" x2="120" y2="460" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0967F7" stopOpacity="0.08" />
          <stop offset="0.6" stopColor="#5969AB" stopOpacity="0.05" />
          <stop offset="1" stopColor="#F3F6FC" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path
        filter="url(#blurR)"
        d="M164 92c72-40 176-18 224 52 41 60 25 144-22 199-43 50-101 54-141 91-45 42-64 93-127 77-72-19-120-96-115-174 5-70 62-103 96-158 30-48 34-63 85-87z"
        fill="url(#gR)"
      />
    </svg>
  </div>

  {/* Content */}
  <div className="relative mx-auto max-w-4xl text-center space-y-10">
    {/* Small pill – social proof with user avatars */}
    <motion.div
      className="inline-flex items-center gap-2 rounded-full bg-surface px-2 py-1.5 shadow-soft border border-border"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="flex -space-x-2">
        <img src="https://i.pravatar.cc/56?u=1" alt="" className="h-6 w-6 rounded-full border-2 border-surface object-cover" />
        <img src="https://i.pravatar.cc/56?u=2" alt="" className="h-6 w-6 rounded-full border-2 border-surface object-cover" />
        <img src="https://i.pravatar.cc/56?u=3" alt="" className="h-6 w-6 rounded-full border-2 border-surface object-cover" />
      </div>
      <span className="text-small font-medium text-text-secondary px-1">
        Trusted by early users
      </span>
    </motion.div>

    {/* Headline – word-by-word blur reveal (Awake-style) */}
    <div className="space-y-4 sm:space-y-5">
      <h1 className="text-center font-bold tracking-tight leading-[1.1] text-[2.5rem] sm:text-[3.75rem] md:text-[4.25rem] lg:text-[5rem] xl:text-[5.5rem] overflow-visible">
        <span className="inline-block">
          <span className="block whitespace-nowrap">
            <AnimatedWords text="Track, split," gradient gradientStartIndex={0} />
          </span>
          <span className="block sm:whitespace-normal whitespace-nowrap">
            <AnimatedWords text="and settle with ease." baseDelay={2 * WORD_STAGGER_S} gradient gradientStartIndex={2} />
          </span>
        </span>
      </h1>

      <motion.p
        className="text-base sm:text-lg md:text-xl text-text-muted max-w-xl mx-auto text-center leading-relaxed"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        Equilo helps housemates track shared expenses, settle balances, and avoid awkward money talks so everyone feels things are fair.
      </motion.p>
    </div>

    {/* CTA */}
    <motion.div
      className="flex justify-center"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, delay: 1.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link
        to="/register"
        className="group btn btn-primary rounded-full min-h-12 sm:min-h-0 px-8 py-4 sm:px-10 sm:py-4 text-base font-semibold gap-0 group-hover:gap-2 no-underline inline-flex items-center transition-transform duration-200 hover:scale-105 transition-[gap] duration-200 shadow-md"
      >
        Get started for free
        <ArrowRight
          className="w-0 min-w-0 overflow-hidden opacity-0 -translate-x-1 group-hover:w-4 group-hover:min-w-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0"
          aria-hidden
        />
      </Link>
    </motion.div>
  </div>
</section>

        {/* Overview cards row + blue highlight band */}
        <section id="overview" className="px-4 pt-4 pb-16 sm:px-6 lg:px-8 sm:pt-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Top row: three cards */}
            <motion.div
              className="grid gap-6 lg:grid-cols-3"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              {/* Card 1: Track every shared cost */}
              <motion.div className="rounded-2xl bg-surface border border-border shadow-card p-6 flex flex-col gap-4" variants={slideUp}>
                <div>
                  <h3 className="text-h3 text-text-primary mb-1">See every shared cost</h3>
                  <p className="text-small text-text-secondary">
                    Group expenses by place and category so rent, groceries, and utilities are always up to date.
                  </p>
                </div>
                <div className="mt-1 rounded-2xl overflow-hidden bg-base-200 border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-small text-text-muted mb-1">This month · Riverside Flat</p>
                    <p className="text-body-lg font-semibold text-text-primary mb-0">A$540.00</p>
                    <p className="text-small text-success font-medium">You&apos;re owed</p>
                  </div>
                  <div className="flex flex-col gap-2 text-small">
                    <div className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-1 text-success">
                      <Receipt className="w-3.5 h-3.5" aria-hidden />
                      <span>5 expenses</span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-base-300 px-2 py-1 text-text-secondary">
                      <Users className="w-3.5 h-3.5" aria-hidden />
                      <span>3 housemates</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Card 2: Who owes who */}
              <motion.div className="rounded-2xl bg-surface border border-border shadow-card p-6 flex flex-col gap-4" variants={slideUp}>
                <div>
                  <h3 className="text-h3 text-text-primary mb-1">Know who owes who</h3>
                  <p className="text-small text-text-secondary">
                    Clear balances for every person in your place so you never guess who should pay next.
                  </p>
                </div>
                <div className="mt-2 flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
                        DS
                      </span>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-text-primary mb-0.5">You</p>
                        <p className="text-small text-text-muted mb-0">Owed from groceries &amp; rent</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-success">+A$270.00</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-surface border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-base-200 text-text-secondary text-sm font-semibold">
                        J
                      </span>
                      <p className="text-sm font-semibold text-text-primary mb-0">Jordan</p>
                    </div>
                    <p className="text-sm text-text-muted">A$270.00 to you</p>
                  </div>
                </div>
              </motion.div>

              {/* Card 3: Places & search */}
              <motion.div className="rounded-2xl bg-surface border border-border shadow-card p-6 flex flex-col gap-4" variants={slideUp}>
                <div className="inline-flex items-center gap-2 rounded-full bg-bg px-3 py-1 text-small font-medium text-text-secondary">
                  <Building2 className="w-3.5 h-3.5" aria-hidden />
                  <span>Equilo places</span>
                </div>
                <div>
                  <h3 className="text-h3 text-text-primary mb-1">Keep every place separate</h3>
                  <p className="text-small text-text-secondary">
                    Create a space for each home, trip, or project and keep bills and members neatly organised.
                  </p>
                </div>
                <div className="mt-2 space-y-2">
                  {[
                    { name: 'Riverside Flat', members: 3, tag: 'Home' },
                    { name: 'Project Alpha', members: 4, tag: 'Project' },
                  ].map((place) => (
                    <div key={place.name} className="flex items-center justify-between rounded-xl bg-bg border border-border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-small font-semibold">
                          {place.name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{place.name}</p>
                          <p className="text-small text-text-muted">{place.members} members · {place.tag}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>

            {/* Blue highlight band */}
            <motion.div
              className="rounded-2xl bg-gradient-to-r from-primary to-secondary text-primary-content p-6 sm:p-7 md:p-8 flex flex-col gap-6"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="max-w-xl">
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-small font-medium text-primary-content/90 mb-3">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" aria-hidden />
                    Live overview for every place
                  </p>
                  <h3 className="text-xl font-semibold mb-2">Always know where your money stands.</h3>
                  <p className="text-sm text-primary-content/90 mb-0">
                    Equilo shows you totals for the month, what you&apos;re owed, and what you owe others, all in one clear dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/register'; }}
                  className="btn bg-base-100 text-primary rounded-full px-5 py-2.5 min-h-12 sm:min-h-0 text-sm font-semibold hover:bg-base-200 shrink-0 no-underline"
                >
                  Explore the dashboard
                  <ArrowRight className="w-4 h-4 ml-2" aria-hidden />
                </button>
              </div>
              {/* Mini live preview strip */}
              <div className="flex flex-wrap gap-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-4">
                <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5 min-w-0">
                  <span className="text-small text-primary-content/80 uppercase tracking-wide">This month</span>
                  <span className="text-lg font-semibold tabular-nums">A$1,420</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5 min-w-0">
                  <span className="text-small text-primary-content/80 uppercase tracking-wide">You&apos;re owed</span>
                  <span className="text-lg font-semibold tabular-nums text-success">+A$540</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5 min-w-0">
                  <span className="text-small text-primary-content/80 uppercase tracking-wide">Riverside Flat</span>
                  <span className="text-sm text-primary-content/90">3 members · All settled</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

       
        {/* How it works – exact reference layout: header row + three cards with variants */}
        <section id="how-it-works">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            {/* Header row: heading left (with small icons), description + button right */}
            <motion.div
              className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5 }}
            >
              <div className="max-w-xl">
                <h2 className="text-h2 text-text-primary leading-tight">
                  How Equilo Works
                </h2>
              </div>
              <div className="flex flex-col gap-4 max-w-md lg:pt-1">
                <p className="text-body leading-relaxed text-text-secondary">
                  Three simple steps so everyone stays on the same page. Add expenses, split fairly, and settle up without the awkward conversations.
                </p>
                <Link
                  to="/register"
                  className="btn btn-primary rounded-xl px-6 py-2.5 min-h-12 sm:min-h-0 text-sm font-semibold w-fit no-underline"
                >
                  See more
                </Link>
              </div>
            </motion.div>

            {/* Three cards – exact reference structure and positioning */}
            <motion.div
              className="mt-14 grid gap-6 sm:grid-cols-3"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              <motion.div variants={slideUp}><HowItWorksCard1
                number="01"
                title="Add an expense"
                description="Upload a bill or just enter the amount in seconds."
              /></motion.div>
              <motion.div variants={slideUp}><HowItWorksCard2
                number="02"
                title="Split automatically"
                description="Choose who shares it. Split equally or customise shares."
              /></motion.div>
              <motion.div variants={slideUp}><HowItWorksCard3
                number="03"
                title="Settle up"
                description="See exactly who owes who and never chase money again."
              /></motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-h2 text-text-primary">Designed for shared living</h2>
              <p className="mt-3 text-body text-text-secondary max-w-2xl mx-auto">
                Everything you need to keep house finances fair, clear, and stress‑free.
              </p>
            </motion.div>
            <motion.div
              className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              <motion.div variants={slideUp}><FeatureCard
                icon={BarChart3}
                title="Smart balance tracking"
                description="Know exactly who owes what in real time, across all expenses."
                accent="primary"
              /></motion.div>
              <motion.div variants={slideUp}><FeatureCard
                icon={Percent}
                title="Flexible splits"
                description="Split equally, by shares, or custom amounts for each person."
                accent="secondary"
              /></motion.div>
              <motion.div variants={slideUp}><FeatureCard
                icon={History}
                title="Expense history"
                description="Every bill recorded in one place. No more lost screenshots."
                accent="success"
              /></motion.div>
              <motion.div variants={slideUp}><FeatureCard
                icon={Building2}
                title="Multiple places"
                description="Create separate groups for home, trips, or side projects."
                accent="primary"
              /></motion.div>
            </motion.div>
          </div>
        </section>

        {/* Testimonials – FutureLearn-style layout */}
        <section id="testimonials" className="relative overflow-visible py-8 md:py-20">
          <div className="mx-auto max-w-5xl px-4 py-4 sm:py-12 md:py-20 sm:px-6 lg:px-8 overflow-visible">
            {/* Mobile: stacked layout */}
            <motion.div
              className="md:hidden space-y-4"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5 }}
            >
              <div className="text-center">
                <h2 className="text-h2 text-text-primary m-0">What housemates say <span className="text-primary font-bold">Equilo</span></h2>
                <p className="mt-3 text-sm text-text-secondary m-0 max-w-md mx-auto">Hear from people in shared homes who have made bill splitting fair, transparent, and stress-free.</p>
                <Link to="/register" className="mt-5 btn btn-primary rounded-lg px-6 py-3 min-h-12 sm:min-h-0 gap-2 no-underline inline-flex items-center">Get started <ArrowRight className="w-4 h-4 shrink-0" aria-hidden /></Link>
              </div>
              <TestimonialCarousel testimonials={MOBILE_TESTIMONIALS} />
            </motion.div>
            {/* Desktop: radial layout */}
            <motion.div
              className="hidden md:block relative min-h-[420px] sm:min-h-[520px]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5 }}
            >
              {/* Circles + testimonials share same square so avatars can touch rings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                <div className="relative w-[min(95vw,690px)] aspect-square">
                  <div className="absolute inset-0 rounded-full border-1.5 border border-primary/15" />
                  <div className="absolute inset-[10%] rounded-full border-1.5 border border-primary/12" />
                  <div className="absolute inset-[20%] rounded-full border-1.5 border border-primary/10" />
                </div>
              </div>
              {/* Title, subtitle, CTA – centered */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center w-full max-w-md px-8 pointer-events-auto z-10">
                <h2 className="text-h2 text-text-primary m-0">
                  What housemates say <span className="text-primary font-bold">Equilo</span>
                </h2>
                <p className="mt-3 text-sm text-text-secondary m-0 max-w-md">
                  Hear from people in shared homes who have made bill splitting fair, transparent, and stress-free.
                </p>
                <Link to="/register" className="mt-5 btn btn-primary rounded-lg px-6 py-3 min-h-12 sm:min-h-0 gap-2 no-underline inline-flex items-center">
                  Get started
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden />
                </Link>
              </div>
              {/* 5 reviews – avatars centered on rings (outer 50%, middle 40%, inner 30%) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="relative w-[min(95vw,700px)] aspect-square">
                  <SmallTestimonialBubble ringPosition="top-left-outer" photoUrl="https://i.pravatar.cc/80?u=sarah1" fallback="S" quote="No more awkward money chats 💬" />
                  <SmallTestimonialBubble ringPosition="top-right-outer" photoUrl="https://i.pravatar.cc/80?u=liam2" fallback="L" quote="We just add expenses and Equilo does the rest ⚡" />
                  <SmallTestimonialBubble ringPosition="mid-left-outer" photoUrl="https://i.pravatar.cc/80?u=marcus3" fallback="M" quote="Finally, everyone knows who owes what ✨" />
                  <SmallTestimonialBubble ringPosition="mid-right-outer" photoUrl="https://i.pravatar.cc/80?u=jordan4" fallback="J" quote="Saved our sharehouse 🏠" />
                  <SmallTestimonialBubble ringPosition="bottom-outer" photoUrl="https://i.pravatar.cc/80?u=kate5" fallback="K" quote="Split bills, keep friendships 💚" />
                </div>
              </div>
            </motion.div>
            <motion.div
              className="hidden md:flex relative md:-mt-12 z-10 justify-center px-4"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {/* Fade layer – behind card, rings fade and blur as they pass underneath (reference-style) */}
              <div className="absolute inset-0 flex justify-center items-start px-4 pointer-events-none z-0" aria-hidden>
                <div className="w-full max-w-2xl h-40 rounded-t-3xl bg-gradient-to-b from-transparent via-bg/40 to-bg backdrop-blur-sm" />
              </div>
              <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-border p-8 sm:p-10 pt-20 text-center overflow-hidden bg-[#F3F6FA] [box-shadow:0_-23px_240px_rgb(255_255_255),0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.02)_inset]">
                <div className="flex justify-center -mt-6 mb-4">
                  <img
                    src="https://i.pravatar.cc/128?u=sarah"
                    alt=""
                    className="w-16 h-16 rounded-full border-4 border-[#F3F6FA] object-cover opacity-100"
                  />
                </div>
                <p className="text-text-muted text-xs font-medium mb-1">— Sarah L., Sydney</p>
                <p className="text-text-secondary text-xs mb-4">Shared a 4‑person flat</p>
                <p className="text-base text-text-primary leading-relaxed">
                  &ldquo;Equilo saved our sharehouse. No more awkward &apos;who still owes what?&apos; chats. We add expenses in seconds, split fairly, and everyone can see the balances. 🙌&rdquo;
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Final CTA – rounded card (not full width) */}
        <section className="py-10 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="rounded-2xl overflow-hidden bg-surface shadow-card"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.6 }}
            >
              <div className="relative bg-gradient-to-r from-primary to-primary/90 py-14 sm:py-16 px-6 sm:px-8 text-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.12]" aria-hidden style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                <div className="absolute inset-0 opacity-[0.06]" aria-hidden style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                <div className="relative z-10">
                  <h2 className="text-h2 text-primary-content">
                    Ready to make bill splitting easy?
                  </h2>
                  <p className="mt-3 text-sm text-primary-content/90 max-w-xl mx-auto">
                    Create an account in under a minute and invite your housemates.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Link
                      to="/register"
                      className="btn bg-base-100 text-primary rounded-full px-6 py-3 min-h-12 sm:min-h-0 text-sm font-semibold shadow-md hover:bg-base-200 no-underline"
                    >
                      Create your free account
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <motion.footer
        id="about"
        className="overflow-hidden bg-surface border-t border-border"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={viewportOnce}
        transition={{ duration: 0.5 }}
      >
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link to="/" className="inline-flex items-center gap-2">
                <img src="../src/assets/logo/app_icon.svg" alt="Equilo" className="w-8 h-8" />
                <span className="text-body-lg font-semibold tracking-tight text-text-primary leading-none">
                  Equilo
                </span>
              </Link>
              <p className="mt-2 text-sm text-text-secondary max-w-xs">
                <span className="block">Track, split, 
                and settle with ease.</span>
              </p>
            </div>
            <div className="grid gap-10 sm:grid-cols-3">
              <div>
                <h3 className="mb-4 text-sm font-semibold text-primary">Product</h3>
                <ul className="space-y-3">
                  <li><button type="button" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-text-secondary hover:text-text-primary">Features</button></li>
                  <li><button type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-text-secondary hover:text-text-primary">How it works</button></li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-sm font-semibold text-primary">About us</h3>
                <ul className="space-y-3">
                  <li><span className="text-sm text-text-secondary">Our mission</span></li>
                  <li><span className="text-sm text-text-secondary">Contact</span></li>
                  <li><span className="text-sm text-text-secondary">Blog</span></li>
                </ul>
              </div>
              <div>
                <h3 className="mb-4 text-sm font-semibold text-primary">Legal</h3>
                <ul className="space-y-3">
                  <li><a href="#terms" className="text-sm text-text-secondary hover:text-text-primary">Terms of Use</a></li>
                  <li><a href="#privacy" className="text-sm text-text-secondary hover:text-text-primary">Privacy</a></li>
                  <li><a href="#cookies" className="text-sm text-text-secondary hover:text-text-primary">Cookies</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-primary px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-primary-content">
            <p className="m-0">© {new Date().getFullYear()} Equilo. All rights reserved.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <a href="#terms" className="hover:underline">Terms of Use</a>
              <a href="#privacy" className="hover:underline">Privacy</a>
              <a href="#cookies" className="hover:underline">Cookies</a>
              <a href="#policies" className="hover:underline">Policies</a>
            </div>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}

/* Icon block – light blue rounded rectangle, subtle shadow (reference: #e0eaff) */
function IconBlock({ children, helperText }) {
  return (
    <div className="rounded-xl bg-[#e0eaff] shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5 flex flex-col items-center justify-center gap-2 w-full min-h-[120px]">
      <div className="flex items-center justify-center gap-4">
        {children}
      </div>
      {helperText && (
        <span className="text-xs text-text-muted">{helperText}</span>
      )}
    </div>
  );
}

/* Card 1: 01 top-right | icon block (receipt, $, +) | quote + description | title */
function HowItWorksCard1({ number, title, description }) {
  return (
    <article className="relative rounded-2xl bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-border overflow-hidden flex flex-col">
      <span className="absolute top-4 right-4 text-[2.5rem] sm:text-[3rem] font-bold text-text-primary tabular-nums leading-none opacity-10" aria-hidden>{number}</span>
      <div className="w-full mt-2">
        <IconBlock>
          <Receipt className="w-10 h-10 text-primary" strokeWidth={1.5} />
          <CircleDollarSign className="w-10 h-10 text-primary" strokeWidth={1.5} />
          <Plus className="w-8 h-8 text-primary" strokeWidth={2} />
        </IconBlock>
      </div>
      <div className="mt-5 flex items-start gap-2">
        <span className="text-text-muted font-serif text-2xl sm:text-3xl leading-none select-none shrink-0" aria-hidden>&ldquo;</span>
        <p className="text-sm text-text-secondary leading-relaxed pt-0.5">{description}</p>
      </div>
      <h3 className="mt-3 text-lg sm:text-xl font-bold text-text-primary leading-snug">{title}</h3>
    </article>
  );
}

/* Card 2: 02 top-right | icon block (person, scale, person) + helper | title | description | closing quote */
function HowItWorksCard2({ number, title, description }) {
  return (
    <article className="relative rounded-2xl bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-border overflow-hidden flex flex-col">
      <span className="absolute top-4 right-4 text-[2.5rem] sm:text-[3rem] font-bold text-text-primary tabular-nums leading-none opacity-10" aria-hidden>{number}</span>
      <div className="w-full mt-2">
        <IconBlock helperText="Split equally or custom">
          <Users className="w-9 h-9 text-primary" strokeWidth={1.5} />
          <Scale className="w-10 h-10 text-primary" strokeWidth={1.5} />
          <Users className="w-9 h-9 text-primary" strokeWidth={1.5} />
        </IconBlock>
      </div>
      <h3 className="mt-5 text-lg sm:text-xl font-bold text-text-primary leading-snug">{title}</h3>
      <div className="mt-2 flex items-start gap-2">
        <p className="text-sm text-text-secondary leading-relaxed flex-1">{description}</p>
        <span className="text-text-muted font-serif text-2xl sm:text-3xl leading-none select-none shrink-0" aria-hidden>&rdquo;</span>
      </div>
    </article>
  );
}

/* Card 3: 03 + title in same row top | quote + description | icon block (wallet, check) + helper */
function HowItWorksCard3({ number, title, description }) {
  return (
    <article className="relative rounded-2xl bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-border overflow-hidden flex flex-col">
      <div className="flex items-center gap-2">
        <span className="text-[2.5rem] sm:text-[3rem] font-bold text-text-primary tabular-nums leading-none shrink-0 opacity-10" aria-hidden>{number}</span>
        <h3 className="text-lg sm:text-xl font-bold text-text-primary leading-snug">{title}</h3>
      </div>
      <div className="mt-4 flex items-start gap-2">
        <span className="text-text-muted font-serif text-2xl sm:text-3xl leading-none select-none shrink-0" aria-hidden>&ldquo;</span>
        <p className="text-sm text-text-secondary leading-relaxed pt-0.5">{description}</p>
      </div>
      <div className="w-full mt-5">
        <IconBlock helperText="Who owes who">
          <Wallet className="w-10 h-10 text-primary" strokeWidth={1.5} />
          <CheckCircle2 className="w-10 h-10 text-primary" strokeWidth={1.5} />
        </IconBlock>
      </div>
    </article>
  );
}

function FeatureCard({ icon: Icon, title, description, accent = 'primary' }) {
  const accentClasses = {
    primary: 'bg-primary/15 text-primary',
    secondary: 'bg-secondary/15 text-secondary',
    success: 'bg-success/15 text-success',
  };
  const bgClass = accentClasses[accent] || accentClasses.primary;
  return (
    <article className="group relative rounded-2xl bg-surface border border-border shadow-soft p-6 transition-all duration-300 hover:shadow-card hover:border-primary/20 hover:-translate-y-0.5">
      <div className="flex flex-col gap-4">
        <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bgClass}`}>
          {Icon && <Icon className="w-6 h-6" strokeWidth={1.5} aria-hidden />}
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary leading-snug">{title}</h3>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">{description}</p>
        </div>
      </div>
    </article>
  );
}

function TestimonialCarousel({ testimonials }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const cardRefs = useRef([]);
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft } = scrollRef.current;
    const cards = scrollRef.current.querySelectorAll('[data-carousel-card]');
    let idx = 0;
    cards.forEach((el, i) => {
      if (el.offsetLeft - scrollLeft < el.offsetWidth / 2) idx = i;
    });
    setActiveIndex(idx);
  };
  const scrollTo = (i) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };
  return (
    <div className="pt-4 space-y-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-none overscroll-x-contain -mx-4 px-4"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {testimonials.map((t, i) => (
          <div
            key={t.quote}
            ref={(el) => { cardRefs.current[i] = el; }}
            data-carousel-card
            className="flex-shrink-0 w-[85vw] max-w-[340px] snap-center rounded-3xl bg-base-200 border border-border shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-6 pt-16 text-center"
          >
            <div className="flex justify-center -mt-12 mb-4">
              <img src={t.photoUrl} alt="" className="w-16 h-16 rounded-full border-4 border-base-200 object-cover opacity-100" />
            </div>
            <p className="text-text-muted text-xs font-medium mb-1">— {t.name}, {t.location}</p>
            <p className="text-text-secondary text-xs mb-4">{t.context}</p>
            <p className="text-base text-text-primary leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        {testimonials.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            className={`w-2 h-2 rounded-full transition-colors ${i === activeIndex ? 'bg-primary' : 'bg-base-300'}`}
            aria-label={`Go to testimonial ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

const MOBILE_TESTIMONIALS = [
  { photoUrl: 'https://i.pravatar.cc/128?u=sarah1', name: 'Sarah L.', location: 'Sydney', context: 'Shared a 4‑person flat', quote: 'No more awkward money chats 💬' },
  { photoUrl: 'https://i.pravatar.cc/128?u=liam2', name: 'Liam M.', location: 'Melbourne', context: 'Lives with 3 flatmates', quote: 'We just add expenses and Equilo does the rest ⚡' },
  { photoUrl: 'https://i.pravatar.cc/128?u=marcus3', name: 'Marcus T.', location: 'Brisbane', context: 'Student house', quote: 'Finally, everyone knows who owes what ✨' },
  { photoUrl: 'https://i.pravatar.cc/128?u=jordan4', name: 'Jordan K.', location: 'Perth', context: 'Shared a 5‑person house', quote: 'Saved our sharehouse 🏠' },
  { photoUrl: 'https://i.pravatar.cc/128?u=kate5', name: 'Kate R.', location: 'Adelaide', context: 'Lives with housemates', quote: 'Split bills, keep friendships 💚' },
];

/* All on outermost ring (radius 50%): 135°, 45°, 180°, 0°, 270° */
const RING_POSITIONS = {
  'top-left-outer': { position: 'left-[-8%] top-[7%]', chatAlign: 'end' },
  'top-right-outer': { position: 'right-[-17%] top-[14%]', chatAlign: 'start' },
  'mid-left-outer': { position: 'left-[-15%] top-1/2 -translate-y-1/2', chatAlign: 'end' },
  'mid-right-outer': { position: 'right-[-5%] top-[55%] -translate-y-1/2', chatAlign: 'start' },
  'bottom-outer': { position: 'top-[7%] left-[25%]', chatAlign: 'end' },
};

function SmallTestimonialBubble({ ringPosition, photoUrl, fallback, quote }) {
  const cfg = RING_POSITIONS[ringPosition] ?? { position: '', chatAlign: 'start' };
  const { position: pos, chatAlign } = cfg;
  const isEnd = chatAlign === 'end';
  const isBottom = chatAlign === 'start-bottom';
  return (
    <div className={`absolute ${pos} max-w-[180px] sm:max-w-[200px] ${isBottom ? 'flex flex-col items-center' : ''}`}>
      <div className={`chat gap-1 ${isEnd ? 'chat-end' : 'chat-start'} ${isBottom ? 'flex flex-col items-center' : ''}`}>
        <div className="chat-image avatar">
          <div className="w-10 rounded-full border-2 border-surface overflow-hidden bg-primary/20">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="object-cover opacity-100" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-primary">{fallback}</span>
            )}
          </div>
        </div>
        <div className="chat-bubble bg-primary/10 border border-primary/20 text-text-primary text-xs">
          &ldquo;{quote}&rdquo;
        </div>
      </div>
    </div>
  );
}

function Testimonial({ quote, name, location }) {
  return (
    <div className="rounded-2xl bg-base-200 p-6 shadow-soft border border-border">
      <p className="text-sm text-text-primary">“{quote}”</p>
      <p className="mt-3 text-xs font-semibold text-text-muted">
        — {name}, {location}
      </p>
    </div>
  );
}

