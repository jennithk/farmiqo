import {
  Apple,
  ArrowLeft,
  ArrowRight,
  Banana,
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Carrot,
  Check,
  Cherry,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Citrus,
  ClipboardList,
  Clock,
  Download,
  Egg,
  Grape,
  Grid2X2,
  Heart,
  House,
  ImagePlus,
  Leaf,
  LeafyGreen,
  MapPin,
  Milk,
  Package,
  Plus,
  QrCode,
  Salad,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Sprout,
  Star,
  Tractor,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  Wallet,
  Wheat,
  createElement,
} from 'lucide';

const icons = {
  Apple,
  ArrowLeft,
  ArrowRight,
  Banana,
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Carrot,
  Check,
  Cherry,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Citrus,
  ClipboardList,
  Clock,
  Download,
  Egg,
  Grape,
  Grid2X2,
  Heart,
  House,
  ImagePlus,
  Leaf,
  LeafyGreen,
  MapPin,
  Milk,
  Package,
  Plus,
  QrCode,
  Salad,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Sprout,
  Star,
  Tractor,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  Wallet,
  Wheat,
};

// Central mapping: category key -> lucide icon name. Vegetables must never
// resolve to profile/user icons; people icons are reserved for people contexts
// (profile nav, farmer badge, bulk pooling).
export const CATEGORY_ICONS = {
  All: 'Grid2X2',
  Veg: 'Carrot',
  Fruits: 'Apple',
  Leafy: 'LeafyGreen',
  Dairy: 'Milk',
  default: 'Sprout',
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
}

// Central mapping: produce keyword -> icon for contexts where no photo exists.
// Only exact-match produce gets a specific icon; nothing falls back to a
// misleading product image.
const PRODUCE_KEYWORDS = [
  ['tomato', 'Cherry'],
  ['cherry', 'Cherry'],
  ['apple', 'Apple'],
  ['banana', 'Banana'],
  ['plantain', 'Banana'],
  ['carrot', 'Carrot'],
  ['mango', 'Apple'],
  ['orange', 'Citrus'],
  ['lemon', 'Citrus'],
  ['lime', 'Citrus'],
  ['grape', 'Grape'],
  ['spinach', 'LeafyGreen'],
  ['palak', 'LeafyGreen'],
  ['methi', 'LeafyGreen'],
  ['cabbage', 'LeafyGreen'],
  ['cauliflower', 'LeafyGreen'],
  ['lettuce', 'Salad'],
  ['greens', 'LeafyGreen'],
  ['milk', 'Milk'],
  ['curd', 'Milk'],
  ['paneer', 'Milk'],
  ['egg', 'Egg'],
  ['wheat', 'Wheat'],
  ['rice', 'Wheat'],
];

export function produceIcon(productName, category) {
  const name = String(productName || '').toLowerCase();
  for (const [keyword, iconName] of PRODUCE_KEYWORDS) {
    if (name.includes(keyword)) return iconName;
  }
  return categoryIcon(category);
}

export function icon(name, size = 18) {
  const definition = icons[name];
  if (!definition) return '';
  return createElement(definition, {
    width: size,
    height: size,
    strokeWidth: 1.8,
    class: 'ui-icon',
    'aria-hidden': 'true',
    focusable: 'false',
  }).outerHTML;
}
