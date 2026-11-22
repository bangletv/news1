// Throttled IndexNow batch submission for participating search engines (Bing, Yandex, Naver, Seznam).
// Google does not support IndexNow; Google relies on XML sitemaps and internal hub linking.
// Do NOT use the Google Indexing API (restricted to hosted JobPosting and BroadcastEvent).

export interface IndexNowBatchResult {
  submitted: number;
  endpoint: string;
  status: number;
  skippedReason?: string;
}

export async function submitIndexNowBatch(params: {
  host: string;
  key: string;
  urls: string[];
  endpoint?: string;
  fetcher?: typeof fetch;
}): Promise<IndexNowBatchResult> {
  const endpoint = params.endpoint ?? 'https://api.indexnow.org/indexnow';
  if (!params.key.trim()) {
    return { submitted: 0, endpoint, status: 0, skippedReason: 'INDEXNOW_KEY not configured' };
  }

  const batch = params.urls.slice(0, 100);
  if (batch.length === 0) {
    return { submitted: 0, endpoint, status: 204, skippedReason: 'No newly verified URLs' };
  }

  const fn = params.fetcher ?? fetch;
  const res = await fn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: params.host,
      key: params.key,
      keyLocation: `https://${params.host}/${params.key}.txt`,
      urlList: batch,
    }),
  });

  return {
    submitted: res.ok ? batch.length : 0,
    endpoint,
    status: res.status,
  };
}
