import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { OrTrackColors } from '@/constants/theme';
import { usePremium } from '@/contexts/premium-context';
import { formatDateShortFR } from '@/utils/format';

// ─── Types ────────────────────────────────────────────────────────────────────

type Article = {
  title: string;
  link: string;
  pubDate: string;
};

type Source = {
  key: string;
  label: string;
  lang: 'FR' | 'EN';
  rssUrl: string;
  color: string;
};

// ─── Sources RSS ──────────────────────────────────────────────────────────────

const SOURCES: Source[] = [
  {
    key: 'loretlargent',
    label: "L'Or et l'Argent",
    lang: 'FR',
    rssUrl: 'https://www.loretlargent.info/feed/',
    color: '#C9A84C',
  },
  {
    key: 'aucoffre',
    label: 'AuCOFFRE Académie',
    lang: 'FR',
    rssUrl: 'https://www.aucoffre.com/academie/feed/',
    color: '#C9A84C',
  },
  {
    key: 'goldbroker',
    label: 'Goldbroker',
    lang: 'EN',
    rssUrl: 'https://goldbroker.com/news.rss',
    color: '#C9A84C',
  },
  {
    key: 'silverseek',
    label: 'SilverSeek',
    lang: 'EN',
    rssUrl: 'https://silverseek.com/rss.xml',
    color: '#A8A8B8',
  },
  {
    key: 'cmi',
    label: 'CMI Gold & Silver',
    lang: 'EN',
    rssUrl: 'https://cmi-gold-silver.com/feed/',
    color: '#A8A8B8',
  },
  {
    key: 'bullionstar',
    label: 'BullionStar',
    lang: 'EN',
    rssUrl: 'https://www.bullionstar.com/rss',
    color: '#A8A8B8',
  },
];

const COUNT = 4;

// ─── Cache 15 minutes ─────────────────────────────────────────────────────────

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: Record<string, Article[]>; timestamp: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return formatDateShortFR(d);
  } catch {
    return '';
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchArticles(source: Source): Promise<Article[]> {
  const res = await fetch(source.rssUrl, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'OrTrack/1.0',
    },
  });
  const xml = await res.text();

  // Extrait les <item> du XML
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const items = xml.match(itemRegex) ?? [];

  const seenTitles = new Set<string>();
  return items.map((item) => {
    const cleanItem = item.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const title = (
      cleanItem.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
      ?? cleanItem.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?? ''
    ).trim();
    if (!title || seenTitles.has(title)) return null;
    seenTitles.add(title);
    const link = (
      cleanItem.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
      ?? cleanItem.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i)?.[1]
      ?? ''
    ).trim();
    const pubDate = (
      cleanItem.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? cleanItem.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
      ?? ''
    ).trim();
    return { title: decodeHtmlEntities(title), link, pubDate };
  }).filter((a): a is Article => a !== null && a.title.length > 0 && a.link.length > 0)
    .slice(0, COUNT);
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function ActualitesPanel() {
  const [articles, setArticles] = useState<Record<string, Article[]>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const { isPremium, showPaywall, isSourceLocked } = usePremium();

  useEffect(() => {
    let cancelled = false;

    // Utilise le cache si < 15 min
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      setArticles(cache.data);
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.allSettled(
      SOURCES.map((s, i) => {
        if (isSourceLocked(i)) return Promise.resolve({ key: s.key, items: [] as Article[] });
        return fetchArticles(s).then((items) => ({ key: s.key, items }));
      })
    ).then((results) => {
      if (cancelled) return;
      const newArticles: Record<string, Article[]> = {};
      const newErrors: Record<string, boolean> = {};
      results.forEach((result, i) => {
        const key = SOURCES[i].key;
        if (result.status === 'fulfilled' && result.value.items.length > 0) {
          newArticles[key] = result.value.items;
        } else {
          newErrors[key] = true;
        }
      });
      setArticles(newArticles);
      setErrors(newErrors);
      cache = { data: newArticles, timestamp: Date.now() };
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [isSourceLocked]);

  const openArticle = async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: OrTrackColors.background,
      controlsColor: OrTrackColors.gold,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={OrTrackColors.gold} size="large" />
        <Text style={styles.loadingText}>Chargement des actualités...</Text>
      </View>
    );
  }

  const visibleSources = SOURCES.filter(
    (s, index) => !isSourceLocked(index) && !errors[s.key] && (articles[s.key]?.length ?? 0) > 0
  );

  if (visibleSources.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Actualités indisponibles</Text>
        <Text style={styles.emptyText}>
          Vérifiez votre connexion et réessayez.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {visibleSources.map((source) => (
        <View key={source.key} style={styles.sourceBlock}>

          {/* Header source */}
          <View style={styles.sourceHeader}>
            <View style={[styles.sourceDot, { backgroundColor: source.color }]} />
            <Text style={styles.sourceLabel}>{source.label}</Text>
            <Text style={[styles.sourceLang, { color: source.color }]}>
              {source.lang}
            </Text>
          </View>

          {/* Articles */}
          <View style={styles.card}>
            {(articles[source.key] ?? []).map((article, index) => (
              <View key={`${source.key}-${index}`}>
                <TouchableOpacity
                  style={styles.articleRow}
                  onPress={() => openArticle(article.link)}
                  activeOpacity={0.7}>
                  <View style={styles.articleContent}>
                    <Text style={styles.articleTitle} numberOfLines={2}>
                      {article.title}
                    </Text>
                    {/* TODO: description article si dispo dans le feed */}
                    <Text style={styles.articleDate}>
                      {formatDate(article.pubDate)}
                    </Text>
                  </View>
                  <Text style={styles.articleArrow}>›</Text>
                </TouchableOpacity>
                {index < (articles[source.key]?.length ?? 0) - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>

        </View>
      ))}
      {!isPremium && (
        <TouchableOpacity
          style={styles.premiumNudge}
          onPress={showPaywall}
          activeOpacity={0.7}
        >
          <Text style={styles.premiumNudgeTitle}>
            Débloquer 4+ sources d'actualités
          </Text>
          <Text style={styles.premiumNudgeSubtitle}>
            Sources FR et internationales
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: OrTrackColors.white,
  },
  emptyText: {
    fontSize: 13,
    color: OrTrackColors.subtext,
    textAlign: 'center',
  },

  // Source block
  sourceBlock: {
    marginBottom: 20,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  sourceLang: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Card
  card: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: OrTrackColors.border,
    marginLeft: 16,
  },

  // Article
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  articleContent: {
    flex: 1,
    gap: 4,
  },
  articleTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: OrTrackColors.white,
    lineHeight: 18,
  },
  articleDate: {
    fontSize: 11,
    color: OrTrackColors.subtext,
  },
  articleArrow: {
    fontSize: 20,
    color: OrTrackColors.tabIconDefault,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Premium nudge
  premiumNudge: {
    backgroundColor: OrTrackColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  premiumNudgeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: OrTrackColors.gold,
    marginBottom: 4,
  },
  premiumNudgeSubtitle: {
    fontSize: 12,
    color: OrTrackColors.subtext,
  },
});
