import { describe, expect, it } from 'vitest';
import { countPrecacheEntries, describeOffline } from '../../src/app/offlineStatus.ts';

const base = { supported: true, active: false, installing: false, saved: 0, total: null };

describe('describeOffline', () => {
  it('says to keep it open while the first install downloads', () => {
    expect(describeOffline({ ...base, installing: true, saved: 20, total: 34 })).toBe(
      "offline copy: saving 20/34 files… keep online, don't close yet",
    );
    expect(describeOffline({ ...base, installing: true, saved: 3 })).toContain('saving 3 files');
  });

  it('is ready once a service worker is switched on', () => {
    expect(describeOffline({ ...base, active: true, saved: 34 })).toBe('offline copy: ready ✓ (34 files)');
  });

  it('stays ready while an update downloads', () => {
    const t = describeOffline({ ...base, active: true, installing: true, saved: 34, total: 34 });
    expect(t).toContain('ready ✓');
    expect(t).toContain('update downloading');
  });

  it('explains when there is no offline copy', () => {
    expect(describeOffline(base)).toContain('none');
    expect(describeOffline({ ...base, supported: false })).toContain('not possible');
  });
});

describe('countPrecacheEntries', () => {
  it('counts unique precache URLs in a built sw.js', () => {
    const sw = 'e.precacheAndRoute([{url:"index.html",revision:"a"},{url:"icons/i.png",revision:"b"},{url:"icons/i.png",revision:"b"}],{})';
    expect(countPrecacheEntries(sw)).toBe(2);
  });

  it('is unknown when the format is not recognised', () => {
    expect(countPrecacheEntries('nothing here')).toBeNull();
  });
});
