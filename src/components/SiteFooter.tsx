export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#d7ded8] bg-[#faf9f6]">
      <div className="osn-wrap flex flex-col gap-2 py-8 text-center font-sans text-xs tracking-wide text-[#506560] sm:flex-row sm:items-center sm:justify-between sm:text-left lg:py-10">
        <p>© 2026 TheOpenSource.news. All rights reserved.</p>
        <p className="text-[#506560]">
          Editor &amp; Publisher:{' '}
          <span className="font-medium text-[#132e30]">Sheikh Mehedi Hasan Nadim</span>
          {' · '}
          Contact:{' '}
          <a href="tel:+8801711822220" className="text-[#132e30] hover:text-[#116351] hover:underline">
            +8801711822220
          </a>
          {' · '}
          Email:{' '}
          <a
            href="mailto:info@theopensource.news"
            className="text-[#132e30] hover:text-[#116351] hover:underline"
          >
            info@theopensource.news
          </a>
        </p>
      </div>
    </footer>
  );
}
