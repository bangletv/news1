// Accurate Schema.org structured data only: WebSite, Organization, BreadcrumbList, CollectionPage.
// Strictly never emits JobPosting because TheOpenSource.news links to publishers rather than hosting postings.

export function buildWebSiteJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'TheOpenSource.news',
    url: origin,
    inLanguage: ['en-GB', 'bn'],
  };
}

export function buildOrganizationJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TheOpenSource.news',
    url: origin,
    parentOrganization: {
      '@type': 'Organization',
      name: 'UK School of Artificial Intelligence Ltd',
      identifier: '17041560',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'London',
        addressCountry: 'GB',
      },
    },
  };
}

export function buildBreadcrumbJsonLd(
  origin: string,
  crumbs: { name: string; path: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: c.name,
      item: `${origin.replace(/\/+$/, '')}${c.path}`,
    })),
  };
}

export function buildCollectionPageJsonLd(params: {
  origin: string;
  name: string;
  description: string;
  path: string;
  itemCount: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: params.name,
    description: params.description,
    url: `${params.origin.replace(/\/+$/, '')}${params.path}`,
    numberOfItems: params.itemCount,
  };
}
