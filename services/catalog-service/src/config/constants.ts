export const CATEGORIES = [
  'T-Shirts',
  'Shirts',
  'Dresses',
  'Jeans',
  'Trousers',
  'Ethnic Wear',
  'Jackets',
  'Tops',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];

export const PRODUCT_STATUSES = ['active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const MOVEMENT_TYPES = ['receipt', 'adjustment', 'sale', 'return'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const DEFAULT_REORDER_THRESHOLD = 5;
export const MAX_QUANTITY = 1_000_000;
