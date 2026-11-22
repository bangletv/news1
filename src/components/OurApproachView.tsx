export function OurApproachView() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="border-b border-stone-200 pb-6">
        <p className="font-sans text-xs font-medium tracking-widest text-stone-600 uppercase">
          Editorial &amp; Technical Charter
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Our approach
        </h1>
      </header>

      <section className="space-y-3 text-sm leading-relaxed text-stone-700 sm:text-base">
        <h2 className="font-serif text-xl font-semibold text-stone-900">
          Direct links without rewriting
        </h2>
        <p>
          TheOpenSource.news indexes official institutional headlines exactly as published by
          vetted governments, multilateral agencies, universities, research councils, and recognised
          journals. Selecting any headline opens the original publisher page directly. We do not
          publish summaries, synthetic imagery, or translated headlines.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-stone-700 sm:text-base">
        <h2 className="font-serif text-xl font-semibold text-stone-900">
          Privacy, cookies, and reader choice
        </h2>
        <p>
          In accordance with UK GDPR and PECR principles, we set no tracking or advertising cookies
          and build no personal profiles. Your chosen continent, pillar, category, and interface
          language remain stored strictly inside your own browser.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-stone-700 sm:text-base">
        <h2 className="font-serif text-xl font-semibold text-stone-900">
          Non-endorsement and removal requests
        </h2>
        <p>
          Inclusion of an external link does not imply endorsement by any government, international
          organisation, or university, nor endorsement by those institutions of TheOpenSource.news.
          Publishers may request immediate exclusion or link removal under our 72-hour takedown
          standard.
        </p>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 text-sm leading-relaxed text-stone-700">
        <h2 className="font-serif text-lg font-semibold text-stone-900">
          Operator &amp; Open-Source Licence
        </h2>
        <p className="mt-2">
          TheOpenSource.news is a free, open-source project released under the MIT Licence and
          operated by <strong>UK School of Artificial Intelligence Ltd</strong> (Company No.
          17041560, London).
        </p>
      </section>
    </article>
  );
}
