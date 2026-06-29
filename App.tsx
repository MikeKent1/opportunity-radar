import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';

import { OpportunityCard } from './src/components/OpportunityCard';
import { isSupabaseConfigured, supabase } from './src/lib/supabase';
import { signInWithGoogle, signOut } from './src/services/auth';
import { Opportunity, OpportunitySource } from './src/types';
import {
  loadOpportunities,
  subscribeToOpportunities,
} from './src/services/opportunities';

type Filter =
  | 'all'
  | 'settings'
  | 'giveaways'
  | 'freetoplay'
  | 'launches'
  | 'competitions'
  | 'feeds'
  | 'community'
  | 'grants'
  | 'tenders';

type GiveawayRewardFilter =
  | 'all'
  | 'game'
  | 'dlc'
  | 'in_game_item'
  | 'gift_card'
  | 'hardware'
  | 'cash'
  | 'trip'
  | 'software'
  | 'other';

type PreparedOpportunity = Opportunity & {
  isGiveaway: boolean;
  searchText: string;
};

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Όλα' },
  { id: 'settings', label: 'Settings' },
  { id: 'giveaways', label: 'Giveaways' },
  { id: 'freetoplay', label: 'Free to Play' },
  { id: 'launches', label: 'Launches' },
  { id: 'competitions', label: 'Competitions' },
  { id: 'feeds', label: 'Feeds' },
  { id: 'community', label: 'Community' },
  { id: 'grants', label: 'Grants' },
  { id: 'tenders', label: 'Tenders' },
];

const giveawayRewardFilters: { id: GiveawayRewardFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Games' },
  { id: 'dlc', label: 'DLC' },
  { id: 'in_game_item', label: 'In-game' },
  { id: 'gift_card', label: 'Gift cards' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'cash', label: 'Cash' },
  { id: 'trip', label: 'Trips' },
  { id: 'software', label: 'Software' },
  { id: 'other', label: 'Other' },
];

function isGiveawayOpportunity(opportunity: Opportunity) {
  return (
    opportunity.source_type === 'social' ||
    opportunity.category === 'giveaways' ||
    ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'].includes(opportunity.source)
  );
}

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [giveawayRewardFilter, setGiveawayRewardFilter] =
    useState<GiveawayRewardFilter>('all');
  const [query, setQuery] = useState('');
  const deferredFilter = useDeferredValue(filter);
  const deferredGiveawayRewardFilter = useDeferredValue(giveawayRewardFilter);
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

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
    const unsubscribe = subscribeToOpportunities(() => fetchOpportunities(true));
    return unsubscribe;
  }, [fetchOpportunities]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    const result = await signInWithGoogle();
    setAuthLoading(false);

    if (!result.ok && result.message !== 'Sign in was cancelled.') {
      Alert.alert('Sign in failed', result.message);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    const result = await signOut();
    setAuthLoading(false);

    if (!result.ok) {
      Alert.alert('Sign out failed', result.message);
    }
  };

  const preparedOpportunities = useMemo<PreparedOpportunity[]>(
    () =>
      opportunities.map((opportunity) => ({
        ...opportunity,
        isGiveaway: isGiveawayOpportunity(opportunity),
        searchText:
          `${opportunity.title} ${opportunity.organization} ${opportunity.summary}`.toLocaleLowerCase(
            'el',
          ),
      })),
    [opportunities],
  );

  const fundingCount = useMemo(
    () =>
      opportunities.filter((item) => item.source === 'grants' || item.source === 'eufunding')
        .length,
    [opportunities],
  );

  const visibleOpportunities = useMemo(() => {
    if (deferredFilter === 'settings') return [];

    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase('el');

    return preparedOpportunities.filter((opportunity) => {
      const matchesFilter =
        deferredFilter === 'all' ||
        opportunity.source === deferredFilter ||
        (deferredFilter === 'tenders' && opportunity.source === 'ted') ||
        (deferredFilter === 'launches' && opportunity.source === 'producthunt') ||
        (deferredFilter === 'competitions' && opportunity.source === 'kaggle') ||
        (deferredFilter === 'feeds' && opportunity.source === 'rss') ||
        (deferredFilter === 'community' && opportunity.source === 'reddit') ||
        (deferredFilter === 'grants' &&
          (opportunity.source === 'grants' || opportunity.source === 'eufunding')) ||
        (deferredFilter === 'freetoplay' && opportunity.source === 'freetogame') ||
        (deferredFilter === 'giveaways' && opportunity.isGiveaway);
      const matchesGiveawayReward =
        deferredFilter !== 'giveaways' ||
        deferredGiveawayRewardFilter === 'all' ||
        (opportunity.subcategory ?? 'other') === deferredGiveawayRewardFilter;
      return (
        matchesFilter &&
        matchesGiveawayReward &&
        (!normalizedQuery || opportunity.searchText.includes(normalizedQuery))
      );
    });
  }, [deferredFilter, deferredGiveawayRewardFilter, deferredQuery, preparedOpportunities]);

  const renderOpportunity = useCallback(
    ({ item }: { item: Opportunity }) => <OpportunityCard opportunity={item} />,
    [],
  );

  if (!authReady) {
    return (
      <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.authScreen}>
            <ActivityIndicator color="#D9FF57" />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!session) {
    return (
      <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.loginScreen}>
            <View style={styles.loginHeader}>
              <Text style={styles.loginTitle}>PRIZEN</Text>
              <Text style={styles.loginSubtitle}>Sign in to track and save opportunities.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={authLoading || !isSupabaseConfigured}
              onPress={handleGoogleSignIn}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.authButtonPressed,
                (authLoading || !isSupabaseConfigured) && styles.authButtonDisabled,
              ]}
            >
              {authLoading ? (
                <ActivityIndicator size="small" color="#071A1C" />
              ) : (
                <Text style={styles.loginButtonText}>Continue with Google</Text>
              )}
            </Pressable>
            {!isSupabaseConfigured && (
              <Text style={styles.loginNotice}>Supabase is not configured.</Text>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        <FlatList
          data={visibleOpportunities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={32}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
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
                <View style={styles.topBarCopy}>
                  <Text style={styles.eyebrow}>PRIZEN</Text>
                  <Text style={styles.greeting}>Βρες την επόμενη ευκαιρία σου.</Text>
                </View>
              </View>

              <View style={styles.compactStats}>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>{opportunities.length}</Text>
                  <Text style={styles.statLabel}>ενεργές</Text>
                </View>
                <View style={styles.statChip}>
                  <Text style={styles.statValue}>
                    {fundingCount}
                  </Text>
                  <Text style={styles.statLabel}>χρηματοδοτήσεις</Text>
                </View>
              </View>

              {filter !== 'settings' && (
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
              )}

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

              {filter === 'giveaways' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subfilters}
                >
                  {giveawayRewardFilters.map((item) => {
                    const active = giveawayRewardFilter === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setGiveawayRewardFilter(item.id)}
                        style={[styles.subfilterButton, active && styles.subfilterButtonActive]}
                      >
                        <Text
                          style={[styles.subfilterText, active && styles.subfilterTextActive]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {filter === 'settings' ? (
                <View style={styles.settingsPanel}>
                  <Text style={styles.settingsTitle}>Account</Text>
                  <Text style={styles.settingsLabel}>Signed in as</Text>
                  <Text style={styles.settingsEmail}>{session.user.email}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={authLoading}
                    onPress={handleSignOut}
                    style={({ pressed }) => [
                      styles.logoutButton,
                      pressed && styles.authButtonPressed,
                      authLoading && styles.authButtonDisabled,
                    ]}
                  >
                    {authLoading ? (
                      <ActivityIndicator size="small" color="#071A1C" />
                    ) : (
                      <Text style={styles.logoutButtonText}>Sign out</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Τελευταίες ευκαιρίες</Text>
                  <Text style={styles.resultCount}>{visibleOpportunities.length} RESULTS</Text>
                </View>
              )}

              {notice && filter !== 'settings' && (
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
          renderItem={renderOpportunity}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            filter === 'settings' ? null : loading ? (
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
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
  },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  topBar: {
    minHeight: 58,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  topBarCopy: { alignItems: 'center', paddingHorizontal: 8 },
  eyebrow: { color: '#D9FF57', fontSize: 16, fontWeight: '900', letterSpacing: 1.2 },
  greeting: { color: '#EAF3F1', fontSize: 13, marginTop: 5, textAlign: 'center' },
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  statChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#10191A',
    borderWidth: 1,
    borderColor: '#243436',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statValue: { color: '#D9FF57', fontSize: 17, fontWeight: '800' },
  statLabel: { color: '#8FB3AE', fontSize: 11, fontWeight: '700' },
  authScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginScreen: {
    flex: 1,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginHeader: { alignItems: 'center', marginBottom: 28 },
  loginTitle: { color: '#D9FF57', fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  loginSubtitle: {
    color: '#B8C7C4',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 280,
  },
  loginButton: {
    width: '100%',
    maxWidth: 320,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authButtonPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  authButtonDisabled: { opacity: 0.5 },
  loginButtonText: { color: '#071A1C', fontSize: 15, fontWeight: '900' },
  loginNotice: { color: '#CECFA7', fontSize: 12, marginTop: 14, textAlign: 'center' },
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
  subfilters: { flexDirection: 'row', gap: 7, marginTop: 10 },
  subfilterButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#0B1415',
    borderWidth: 1,
    borderColor: '#223032',
  },
  subfilterButtonActive: { backgroundColor: '#193C39', borderColor: '#7DE0CF' },
  subfilterText: { color: '#7E8C8E', fontSize: 12, fontWeight: '700' },
  subfilterTextActive: { color: '#7DE0CF' },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: { color: '#F2F6F4', fontSize: 20, fontWeight: '800' },
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
  settingsPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#243436',
    backgroundColor: '#0E1718',
    padding: 18,
    marginTop: 24,
  },
  settingsTitle: { color: '#F2F6F4', fontSize: 20, fontWeight: '900' },
  settingsLabel: { color: '#7DE0CF', fontSize: 10, fontWeight: '900', marginTop: 18 },
  settingsEmail: { color: '#DCE8E5', fontSize: 14, fontWeight: '700', marginTop: 6 },
  logoutButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  logoutButtonText: { color: '#071A1C', fontSize: 14, fontWeight: '900' },
  separator: { height: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 55 },
  emptyGlyph: { color: '#D9FF57', fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: '#F2F6F4', fontWeight: '800', fontSize: 17 },
  emptyText: { color: '#718082', fontSize: 13, marginTop: 7 },
  footer: { alignItems: 'center', paddingVertical: 28 },
  footerText: { color: '#455355', fontSize: 10, letterSpacing: 0.4 },
});
