import type { PublicItem } from '../../api/src/contract.ts';

export interface FacebookPostConfig {
  pageId: string;
  pageAccessToken: string;
  dailyCap: number;
}

export class FacebookAutoPoster {
  private postedIds = new Set<string>();
  private dailyCount = 0;
  private dayKey = new Date().toISOString().slice(0, 10);

  async postVerifiedItem(
    item: PublicItem,
    origin: string,
    cfg: FacebookPostConfig,
    fetcher: typeof fetch = fetch
  ): Promise<{ posted: boolean; reason?: string }> {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.dailyCount = 0;
    }

    if (item.verification_status !== 'verified') {
      return { posted: false, reason: 'Only verified items may be posted' };
    }
    if (this.postedIds.has(item.id)) {
      return { posted: false, reason: 'Duplicate post prevented' };
    }
    if (this.dailyCount >= cfg.dailyCap) {
      return { posted: false, reason: 'Daily posting cap reached' };
    }
    if (!cfg.pageAccessToken) {
      return { posted: false, reason: 'FB_PAGE_TOKEN not configured' };
    }

    const message = `${item.source_name}: ${item.title}`;
    const link = `${origin.replace(/\/+$/, '')}/api/v1/out/${item.id}`;
    const res = await fetcher(`https://graph.facebook.com/v21.0/${cfg.pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, link, access_token: cfg.pageAccessToken }),
    });

    if (!res.ok) {
      return { posted: false, reason: `Graph API returned ${res.status}` };
    }
    this.postedIds.add(item.id);
    this.dailyCount += 1;
    return { posted: true };
  }
}
