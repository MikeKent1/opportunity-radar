import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Opportunity } from '../types';

function formatDeadline(value: string | null) {
  if (!value) return 'Χωρίς προθεσμία';

  const date = new Date(value);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);

  if (days < 0) return 'Έληξε';
  if (days === 0) return 'Λήγει σήμερα';
  if (days <= 30) return `${days} ημέρες ακόμη`;

  return date.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount: number | null, currency: string) {
  if (!amount) return null;
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function OpportunityCardComponent({ opportunity }: { opportunity: Opportunity }) {
  const amount = formatAmount(opportunity.amount, opportunity.currency);
  const isGrant =
    opportunity.source === 'grants' || opportunity.source === 'eufunding';
  const isLaunch = opportunity.source === 'producthunt';
  const isCompetition = opportunity.source === 'kaggle';
  const isFeed = opportunity.source === 'rss';
  const isCommunity = opportunity.source === 'reddit';
  const isSocial = opportunity.source_type === 'social';
  const sourceLabel =
    isSocial
      ? `INSTAGRAM @${opportunity.source}`.toUpperCase()
      : opportunity.source === 'gamerpower'
      ? 'GAMERPOWER'
      : opportunity.source === 'epicgames'
        ? 'EPIC GAMES'
        : opportunity.source === 'freetogame'
          ? 'FREE TO PLAY'
          : opportunity.source === 'cheapshark'
            ? 'CHEAPSHARK'
            : opportunity.source === 'eufunding'
              ? 'EU GRANT'
              : opportunity.source === 'ted'
                ? 'EU TENDER'
                : opportunity.source === 'producthunt'
                  ? 'PRODUCT HUNT'
                  : opportunity.source === 'kaggle'
                    ? 'KAGGLE'
                    : opportunity.source === 'rss'
                      ? 'CURATED FEED'
                      : opportunity.source === 'reddit'
                        ? 'REDDIT'
        : isGrant
          ? 'GRANT'
          : 'GIVEAWAY';

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(opportunity.url)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <LinearGradient
        colors={
          isGrant
            ? ['#142526', '#101819']
            : isLaunch
              ? ['#261C17', '#111817']
              : isCompetition
                ? ['#172033', '#101419']
                : isFeed
                  ? ['#1D1C2E', '#101419']
                  : isCommunity
                    ? ['#2A1B17', '#111817']
                    : isSocial
                      ? ['#26172B', '#111817']
              : ['#201F18', '#111817']
        }
        style={styles.cardGradient}
      >
        {opportunity.image_url && (
          <Image
            source={{ uri: opportunity.image_url }}
            resizeMode="cover"
            accessibilityLabel={opportunity.title}
            style={styles.coverImage}
          />
        )}
        <View style={styles.cardTop}>
          <View
            style={[
              styles.sourceBadge,
              isGrant ? styles.grantBadge : isLaunch ? styles.launchBadge : styles.giveawayBadge,
              isCompetition && styles.competitionBadge,
              isFeed && styles.feedBadge,
              isCommunity && styles.communityBadge,
              isSocial && styles.socialBadge,
            ]}
          >
            <Text
              style={[
                styles.sourceText,
                isGrant
                  ? styles.grantText
                  : isLaunch
                    ? styles.launchText
                    : isCompetition
                      ? styles.competitionText
                      : isFeed
                        ? styles.feedText
                        : isCommunity
                          ? styles.communityText
                          : isSocial
                            ? styles.socialText
                      : styles.giveawayText,
              ]}
            >
              {sourceLabel}
            </Text>
          </View>
          <Text style={styles.deadline}>{formatDeadline(opportunity.deadline)}</Text>
        </View>

        <Text style={styles.organization}>{opportunity.organization}</Text>
        <Text style={styles.title}>{opportunity.title}</Text>
        <Text numberOfLines={3} style={styles.summary}>
          {opportunity.summary}
        </Text>

        <View style={styles.tags}>
          {opportunity.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.valueLabel}>
              {isGrant
                ? 'ΕΩΣ'
                : opportunity.source === 'freetogame'
                  ? 'ΜΟΝΤΕΛΟ'
                : opportunity.source === 'ted'
                  ? 'ΕΚΤΙΜΩΜΕΝΗ ΑΞΙΑ'
                  : opportunity.source === 'producthunt'
                    ? 'ΤΥΠΟΣ'
                    : opportunity.source === 'kaggle'
                      ? 'ΒΡΑΒΕΙΟ'
                      : opportunity.source === 'rss'
                        ? 'ΠΗΓΗ'
                        : opportunity.source === 'reddit'
                          ? 'ΚΟΙΝΟΤΗΤΑ'
                    : 'ΑΞΙΑ'}
            </Text>
            <Text style={styles.value}>
              {opportunity.source === 'freetogame'
                ? 'Δωρεάν παιχνίδι'
                : opportunity.source === 'producthunt'
                  ? 'Launch'
                  : opportunity.source === 'rss'
                    ? 'Άρθρο / ευκαιρία'
                    : opportunity.source === 'reddit'
                      ? opportunity.organization
                : amount ?? 'Δες λεπτομέρειες'}
            </Text>
          </View>
          <View style={styles.arrowButton}>
            <Text style={styles.arrow}>↗</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export const OpportunityCard = memo(OpportunityCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#253537',
  },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  cardGradient: { padding: 19 },
  coverImage: {
    width: '100%',
    height: 164,
    borderRadius: 15,
    marginBottom: 16,
    backgroundColor: '#182122',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  grantBadge: { backgroundColor: '#193C39' },
  giveawayBadge: { backgroundColor: '#3B3B1B' },
  launchBadge: { backgroundColor: '#4A251B' },
  competitionBadge: { backgroundColor: '#1C2D51' },
  feedBadge: { backgroundColor: '#2C2757' },
  communityBadge: { backgroundColor: '#4A251B' },
  socialBadge: { backgroundColor: '#4A1F55' },
  sourceText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  grantText: { color: '#7DE0CF' },
  giveawayText: { color: '#D9FF57' },
  launchText: { color: '#FF8A63' },
  competitionText: { color: '#76B7FF' },
  feedText: { color: '#B9A7FF' },
  communityText: { color: '#FF8A63' },
  socialText: { color: '#F0A7FF' },
  deadline: { color: '#849395', fontSize: 11, fontWeight: '600' },
  organization: { color: '#7DA19D', fontSize: 11, marginTop: 18, fontWeight: '700' },
  title: {
    color: '#F3F7F5',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 5,
  },
  summary: { color: '#94A3A2', fontSize: 13, lineHeight: 19, marginTop: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 15 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#1A2526',
    borderWidth: 1,
    borderColor: '#2A3839',
  },
  tagText: { color: '#899797', fontSize: 9, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: '#283536',
  },
  valueLabel: { color: '#607072', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  value: { color: '#D9FF57', fontSize: 17, fontWeight: '800', marginTop: 4 },
  arrowButton: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { color: '#071A1C', fontSize: 19, fontWeight: '800' },
});
