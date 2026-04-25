import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ProductChip } from '@/components/ajouter/ProductChip';
import { OrTrackColors } from '@/constants/theme';
import type { MetalType } from '@/constants/metals';

// Local type kept structurally compatible with `@/constants/products`.Product
// AND `@/constants/silver-products`.SilverMvpProduct, so both flow through the
// same arrays without any cast. `id` is only present on SilverMvpProduct and
// is the marker the silver MVP creation flow uses to opt a chip into a
// single-line label.
export type ProductSelectorProduct = {
  label: string;
  weightG: number | null;
  category: 'piece' | 'lingot' | 'autre';
  popular?: boolean;
  id?: string;
};

export type ProductSelectorProps = {
  metal: MetalType;
  selectedProduct: ProductSelectorProduct | null;
  coinSearch: string;
  visiblePieces: readonly ProductSelectorProduct[];
  visibleLingots: readonly ProductSelectorProduct[];
  totalLingots: number;
  hasCoinsCatalog: boolean;
  showAllPieces: boolean;
  showAllBars: boolean;
  showExpandPiecesButton: boolean;
  isSilverCreationFlow: boolean;
  singleLineLabelIds: readonly string[];
  coinsSectionTitle: string;
  piecesExpandSuffix: string;
  barsExpandSuffix: string;
  onSearchChange: (value: string) => void;
  onProductSelect: (product: ProductSelectorProduct) => void;
  onToggleShowAllPieces: () => void;
  onToggleShowAllBars: () => void;
};

export function ProductSelector({
  selectedProduct,
  coinSearch,
  visiblePieces,
  visibleLingots,
  totalLingots,
  hasCoinsCatalog,
  showAllPieces,
  showAllBars,
  showExpandPiecesButton,
  isSilverCreationFlow,
  singleLineLabelIds,
  coinsSectionTitle,
  piecesExpandSuffix,
  barsExpandSuffix,
  onSearchChange,
  onProductSelect,
  onToggleShowAllPieces,
  onToggleShowAllBars,
}: ProductSelectorProps) {
  const selectedLabel = selectedProduct?.label ?? null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Choisissez un produit</Text>

      {/* Pièces */}
      {hasCoinsCatalog && (
        <>
          <Text style={styles.popularSectionHeader}>{coinsSectionTitle}</Text>

          {/* Search field when expanded */}
          {showAllPieces && (
            <TextInput
              placeholder="Rechercher une pièce..."
              placeholderTextColor={OrTrackColors.textDim}
              value={coinSearch}
              onChangeText={onSearchChange}
              autoFocus={false}
              accessibilityLabel="Rechercher une pièce"
              style={styles.searchInput}
            />
          )}

          {/* No results message */}
          {showAllPieces && coinSearch.trim() !== '' && visiblePieces.length === 0 && (
            <Text style={styles.noResultText}>Aucun produit trouvé</Text>
          )}

          <View style={styles.productGrid}>
            {visiblePieces.map(p => {
              const singleLineLabel =
                isSilverCreationFlow &&
                typeof p.id === 'string' &&
                singleLineLabelIds.includes(p.id);
              return (
                <ProductChip
                  key={p.label}
                  product={p}
                  active={selectedLabel === p.label}
                  compact={showAllPieces}
                  singleLineLabel={singleLineLabel}
                  onPress={onProductSelect}
                />
              );
            })}
          </View>
          {showExpandPiecesButton && (
            <TouchableOpacity
              onPress={onToggleShowAllPieces}
              activeOpacity={0.7}
              style={styles.expandButton}>
              <Text numberOfLines={1} style={styles.expandButtonText}>
                {showAllPieces ? 'Réduire la liste' : 'Voir plus de pièces'}
                {piecesExpandSuffix}
              </Text>
              <Ionicons
                name={showAllPieces ? 'chevron-up' : 'chevron-forward'}
                size={14}
                color={OrTrackColors.gold}
              />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Lingots */}
      {totalLingots > 0 && (
        <>
          {hasCoinsCatalog && (
            <>
              <View style={styles.lingotsSeparator} />
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Lingots</Text>
            </>
          )}
          <View style={styles.productGrid}>
            {visibleLingots.map(p => (
              <ProductChip
                key={p.label}
                product={p}
                active={selectedLabel === p.label}
                onPress={onProductSelect}
              />
            ))}
          </View>
          {totalLingots > 4 && (
            <TouchableOpacity
              onPress={onToggleShowAllBars}
              activeOpacity={0.7}
              style={styles.expandButton}>
              <Text numberOfLines={1} style={styles.expandButtonText}>
                {showAllBars ? 'Réduire la liste' : 'Voir plus de lingots'}
                {barsExpandSuffix}
              </Text>
              <Ionicons
                name={showAllBars ? 'chevron-up' : 'chevron-forward'}
                size={14}
                color={OrTrackColors.gold}
              />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

// Styles
//   - `section` and `sectionTitle` are duplicated from ajouter.tsx because
//     they are shared by other sections (Métal, Poids unitaire, Détails de
//     l'achat) and must remain in ajouter.tsx unchanged. The duplicates here
//     are byte-for-byte identical so visual output is unchanged.
//   - `popularSectionHeader`, `searchInput`, `noResultText`, `productGrid`,
//     `expandButton`, `expandButtonText`, `lingotsSeparator` are exclusive
//     to the product selector block and were moved out of ajouter.tsx.
const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: OrTrackColors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  popularSectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: OrTrackColors.subtext,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  searchInput: {
    backgroundColor: OrTrackColors.card,
    borderWidth: 1,
    borderColor: OrTrackColors.border,
    borderRadius: 8,
    color: OrTrackColors.white,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noResultText: {
    color: OrTrackColors.subtext,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 8,
  },
  expandButtonText: {
    fontSize: 13,
    color: OrTrackColors.gold,
    fontWeight: '600',
    flex: 1,
  },
  lingotsSeparator: {
    borderTopWidth: 1,
    borderTopColor: OrTrackColors.border,
    marginTop: 12,
    marginBottom: 12,
  },
});
