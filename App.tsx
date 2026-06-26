import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { OpportunityCard } from './src/components/OpportunityCard';
import { Opportunity, OpportunitySource } from './src/types';
import {
  loadOpportunities,
  subscribeToOpportunities,
  syncExternalOpportunities,
} from './src/services/opportunities';

type Filter = 'all' | 'giveaways' | 'freetoplay' | 'grants' | 'tenders';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Όλα' },
  { id: 'giveaways', label: 'Giveaways' },
  { id: 'freetoplay', label: 'Free to Play' },
  { id: 'grants', label: 'Grants' },
  { id: 'tenders', label: 'Tenders' },
];

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    const result = await loadOpportunities();
    setOpportunities(result.data);
    setNotice(result.notice);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void fetchOpportunities();
    void syncExternalOpportunities().then((result) => {
      if (result.ok) void fetchOpportunities(true);
    });
    const unsubscribe = subscribeToOpportunities(() => fetchOpportunities(true));
    return unsubscribe;
  }, [fetchOpportunities]);

  const visibleOpportunities = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('el');

    return opportunities.filter((opportunity) => {
      const matchesFilter =
        filter === 'all' ||
        opportunity.source === filter ||
        (filter === 'tenders' && opportunity.source === 'ted') ||
        (filter === 'grants' &&
          (opportunity.source === 'grants' || opportunity.source === 'eufunding')) ||
        (filter === 'freetoplay' && opportunity.source === 'freetogame') ||
        (filter === 'giveaways' &&
          ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'].includes(
            opportunity.source,
          ));
      const haystack =
        `${opportunity.title} ${opportunity.organization} ${opportunity.summary}`.toLocaleLowerCase(
          'el',
        );
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [filter, opportunities, query]);

  const handleSync = async () => {
    setSyncing(true);
    const result = await syncExternalOpportunities();
    setSyncing(false);

    if (!result.ok) {
      Alert.alert('Ο συγχρονισμός δεν ολοκληρώθηκε', result.message);
      return;
    }

    await fetchOpportunities(true);
    Alert.alert('Έτοιμο', result.message);
  };

  return (
    <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        <FlatList
          data={visibleOpportunities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#D9FF57"
              onRefresh={() => {
                setRefreshing(true);
                fetchOpportunities(true);
              }}
            />
          }
          ListHeaderComponent={
            <>
              <View style={styles.topBar}>
                <View style={styles.brandMark}>
                  <Text style={styles.brandMarkText}>OR</Text>
                </View>
                <View style={styles.topBarCopy}>
                  <Text style={styles.eyebrow}>OPPORTUNITY RADAR</Text>
                  <Text style={styles.greeting}>Βρες την επόμενη ευκαιρία σου.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Συγχρονισμός ευκαιριών"
                  disabled={syncing}
                  onPress={handleSync}
                  style={({ pressed }) => [
                    styles.syncButton,
                    pressed && styles.buttonPressed,
                    syncing && styles.buttonDisabled,
                  ]}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color="#071A1C" />
                  ) : (
                    <Text style={styles.syncIcon}>↻</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.hero}>
                <Text style={styles.heroKicker}>CURATED FOR BUILDERS</Text>
                <Text style={styles.heroTitle}>Giveaways και grants, χωρίς το ψάξιμο.</Text>
                <Text style={styles.heroBody}>
                  Ένα ζωντανό feed από GamerPower, Epic Games, Grants.gov και το Supabase.
                </Text>

                <View style={styles.heroStats}>
                  <View>
                    <Text style={styles.statValue}>{opportunities.length}</Text>
                    <Text style={styles.statLabel}>ενεργές ευκαιρίες</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View>
                    <Text style={styles.statValue}>
                      {
                        opportunities.filter(
                          (item) =>
                            item.source === 'grants' || item.source === 'eufunding',
                        ).length
                      }
                    </Text>
                    <Text style={styles.statLabel}>χρηματοδοτήσεις</Text>
                  </View>
                </View>
              </View>

              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Αναζήτηση ευκαιριών..."
                  placeholderTextColor="#718082"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={12}>
                    <Text style={styles.clearIcon}>×</Text>
                  </Pressable>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {filters.map((item) => {
                  const active = filter === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setFilter(item.id)}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                    >
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Τελευταίες ευκαιρίες</Text>
                <Text style={styles.resultCount}>{visibleOpportunities.length} RESULTS</Text>
              </View>

              {notice && (
                <Pressable
                  onPress={() => Linking.openURL('https://supabase.com/dashboard')}
                  style={styles.notice}
                >
                  <Text style={styles.noticeDot}>●</Text>
                  <Text style={styles.noticeText}>{notice}</Text>
                </Pressable>
              )}
            </>
          }
          renderItem={({ item }) => <OpportunityCard opportunity={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color="#D9FF57" />
                <Text style={styles.emptyText}>Φορτώνω τις ευκαιρίες...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyGlyph}>◎</Text>
                <Text style={styles.emptyTitle}>Δεν βρέθηκε κάτι εδώ</Text>
                <Text style={styles.emptyText}>Δοκίμασε άλλη αναζήτηση ή φίλτρο.</Text>
              </View>
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerText}>Powered by Supabase · refreshed on demand</Text>
            </View>
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#071A1C', fontSize: 13, fontWeight: '900', letterSpacing: -0.5 },
  topBarCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { color: '#D9FF57', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  greeting: { color: '#EAF3F1', fontSize: 14, marginTop: 3 },
  syncButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncIcon: { color: '#071A1C', fontSize: 24, fontWeight: '600', marginTop: -2 },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  buttonDisabled: { opacity: 0.65 },
  hero: {
    borderRadius: 26,
    padding: 24,
    backgroundColor: '#123D3B',
    borderWidth: 1,
    borderColor: '#1B5551',
    overflow: 'hidden',
  },
  heroKicker: { color: '#8CC9BF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: {
    color: '#F5F9F7',
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -1.2,
    marginTop: 12,
    maxWidth: 330,
  },
  heroBody: { color: '#AFCBC6', fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 330 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#2B5B58',
  },
  statValue: { color: '#D9FF57', fontSize: 25, fontWeight: '800' },
  statLabel: { color: '#8FB3AE', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: '#2B5B58', marginHorizontal: 28 },
  searchBox: {
    height: 54,
    marginTop: 18,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#243436',
    backgroundColor: '#10191A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchIcon: { color: '#D9FF57', fontSize: 24, marginRight: 10, transform: [{ rotate: '-18deg' }] },
  searchInput: { flex: 1, height: '100%', color: '#EDF4F2', fontSize: 15 },
  clearIcon: { color: '#91A09F', fontSize: 24 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 14 },
  filterButton: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: '#111B1C',
    borderWidth: 1,
    borderColor: '#273638',
  },
  filterButtonActive: { backgroundColor: '#D9FF57', borderColor: '#D9FF57' },
  filterText: { color: '#91A09F', fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#071A1C' },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: { color: '#F2F6F4', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  resultCount: { color: '#647274', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#252516',
    borderWidth: 1,
    borderColor: '#454420',
    marginBottom: 14,
  },
  noticeDot: { color: '#D9FF57', fontSize: 9, marginRight: 9 },
  noticeText: { flex: 1, color: '#CECFA7', fontSize: 12, lineHeight: 17 },
  separator: { height: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 55 },
  emptyGlyph: { color: '#D9FF57', fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: '#F2F6F4', fontWeight: '800', fontSize: 17 },
  emptyText: { color: '#718082', fontSize: 13, marginTop: 7 },
  footer: { alignItems: 'center', paddingVertical: 28 },
  footerText: { color: '#455355', fontSize: 10, letterSpacing: 0.4 },
});
