// Copied from backend/prisma/seed-data.ts so the standalone demo ships the same dataset.
// Keep the two files in sync when changing demo data.
// Demo data for Kaveri Distributors Pvt. Ltd. (FMCG distribution, Karnataka)

export const seedWarehouses = [
  {
    code: 'BLR-CEN',
    name: 'Bengaluru Central Warehouse',
    city: 'Bengaluru',
    address: 'Plot 42, Peenya Industrial Area Phase II, Bengaluru 560058',
    capacity: 60000,
  },
  {
    code: 'MYS-REG',
    name: 'Mysuru Regional Warehouse',
    city: 'Mysuru',
    address: 'No. 18, Hebbal Industrial Area, Mysuru 570016',
    capacity: 30000,
  },
  {
    code: 'MNG-CST',
    name: 'Mangaluru Coastal Warehouse',
    city: 'Mangaluru',
    address: 'Survey 211, Baikampady Industrial Estate, Mangaluru 575011',
    capacity: 25000,
  },
] as const;

export interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  reorderLevel: number;
  description: string;
  /** Opening quantities per warehouse code (BLR, MYS, MNG) */
  opening: [number, number, number];
  /** Daily outbound demand intensity (0-1) used to generate realistic history */
  demand: number;
  isActive?: boolean;
}

export const seedProducts: SeedProduct[] = [
  // Beverages
  { sku: 'KD-BEV-001', name: 'Filter Coffee Powder 500g', category: 'Beverages', unit: 'pack', unitPrice: 285, reorderLevel: 120, description: 'Premium Chikmagalur coffee-chicory blend (80:20).', opening: [600, 260, 180], demand: 0.8 },
  { sku: 'KD-BEV-002', name: 'Assam Tea Leaves 1kg', category: 'Beverages', unit: 'pack', unitPrice: 420, reorderLevel: 80, description: 'Strong CTC tea for hotels and households.', opening: [400, 150, 120], demand: 0.6 },
  { sku: 'KD-BEV-003', name: 'Mango Fruit Drink 1.2L', category: 'Beverages', unit: 'bottle', unitPrice: 75, reorderLevel: 200, description: 'Alphonso mango pulp drink, PET bottle.', opening: [900, 400, 350], demand: 0.9 },
  { sku: 'KD-BEV-004', name: 'Packaged Drinking Water 20L', category: 'Beverages', unit: 'can', unitPrice: 90, reorderLevel: 150, description: 'BIS certified mineral water, returnable can.', opening: [700, 300, 260], demand: 0.7 },
  { sku: 'KD-BEV-005', name: 'Health Malt Drink 750g', category: 'Beverages', unit: 'jar', unitPrice: 395, reorderLevel: 60, description: 'Chocolate malt health drink jar.', opening: [40, 20, 10], demand: 0.5 },
  // Packaged Foods
  { sku: 'KD-PKF-001', name: 'Instant Rava Idli Mix 1kg', category: 'Packaged Foods', unit: 'pack', unitPrice: 165, reorderLevel: 100, description: 'Ready-to-cook rava idli mix.', opening: [500, 220, 160], demand: 0.7 },
  { sku: 'KD-PKF-002', name: 'Masala Dosa Batter 1kg', category: 'Packaged Foods', unit: 'pack', unitPrice: 85, reorderLevel: 150, description: 'Fresh fermented batter, chilled supply.', opening: [450, 200, 150], demand: 1.0 },
  { sku: 'KD-PKF-003', name: 'Bisi Bele Bath Powder 200g', category: 'Packaged Foods', unit: 'pack', unitPrice: 78, reorderLevel: 90, description: 'Traditional Karnataka spice mix.', opening: [380, 180, 90], demand: 0.6 },
  { sku: 'KD-PKF-004', name: 'Instant Noodles Masala 12-Pack', category: 'Packaged Foods', unit: 'box', unitPrice: 168, reorderLevel: 120, description: 'Family pack of 12 masala noodles.', opening: [520, 260, 200], demand: 0.9 },
  { sku: 'KD-PKF-005', name: 'Tomato Ketchup 1kg', category: 'Packaged Foods', unit: 'bottle', unitPrice: 145, reorderLevel: 70, description: 'Rich tomato ketchup, squeeze bottle.', opening: [50, 20, 10], demand: 0.5 },
  // Staples
  { sku: 'KD-STP-001', name: 'Sona Masoori Rice 25kg', category: 'Staples', unit: 'bag', unitPrice: 1450, reorderLevel: 80, description: 'Aged Sona Masoori raw rice.', opening: [420, 180, 140], demand: 0.6 },
  { sku: 'KD-STP-002', name: 'Toor Dal 1kg', category: 'Staples', unit: 'pack', unitPrice: 165, reorderLevel: 200, description: 'Unpolished toor dal.', opening: [800, 350, 250], demand: 0.9 },
  { sku: 'KD-STP-003', name: 'Refined Sunflower Oil 1L', category: 'Staples', unit: 'pouch', unitPrice: 155, reorderLevel: 250, description: 'Fortified refined sunflower oil pouch.', opening: [1000, 450, 380], demand: 1.0 },
  { sku: 'KD-STP-004', name: 'Iodised Salt 1kg', category: 'Staples', unit: 'pack', unitPrice: 28, reorderLevel: 300, description: 'Vacuum evaporated iodised salt.', opening: [1200, 500, 420], demand: 0.8 },
  { sku: 'KD-STP-005', name: 'Whole Wheat Atta 10kg', category: 'Staples', unit: 'bag', unitPrice: 465, reorderLevel: 90, description: 'Chakki fresh whole wheat flour.', opening: [60, 25, 15], demand: 0.6 },
  { sku: 'KD-STP-006', name: 'Jaggery Block 1kg', category: 'Staples', unit: 'pack', unitPrice: 95, reorderLevel: 60, description: 'Organic Mandya jaggery.', opening: [0, 0, 0], demand: 0 },
  // Dairy
  { sku: 'KD-DRY-001', name: 'Pure Ghee 1L', category: 'Dairy', unit: 'jar', unitPrice: 620, reorderLevel: 60, description: 'Cow ghee, traditional danedar.', opening: [300, 120, 90], demand: 0.5 },
  { sku: 'KD-DRY-002', name: 'Milk Powder 500g', category: 'Dairy', unit: 'pack', unitPrice: 245, reorderLevel: 80, description: 'Skimmed milk powder.', opening: [350, 140, 100], demand: 0.5 },
  { sku: 'KD-DRY-003', name: 'Paneer Block 1kg', category: 'Dairy', unit: 'pack', unitPrice: 380, reorderLevel: 50, description: 'Fresh malai paneer, cold chain.', opening: [35, 12, 8], demand: 0.6 },
  // Snacks
  { sku: 'KD-SNK-001', name: 'Mysore Pak Gift Box 500g', category: 'Snacks', unit: 'box', unitPrice: 320, reorderLevel: 40, description: 'Ghee Mysore Pak festive box.', opening: [160, 120, 60], demand: 0.4 },
  { sku: 'KD-SNK-002', name: 'Banana Chips 200g', category: 'Snacks', unit: 'pack', unitPrice: 65, reorderLevel: 120, description: 'Coconut oil fried banana chips.', opening: [480, 200, 260], demand: 0.8 },
  { sku: 'KD-SNK-003', name: 'Masala Peanuts 150g', category: 'Snacks', unit: 'pack', unitPrice: 40, reorderLevel: 150, description: 'Spicy coated peanuts.', opening: [600, 250, 200], demand: 0.9 },
  { sku: 'KD-SNK-004', name: 'Cream Biscuits 24-Pack', category: 'Snacks', unit: 'box', unitPrice: 240, reorderLevel: 80, description: 'Chocolate cream sandwich biscuits.', opening: [320, 150, 110], demand: 0.7 },
  // Personal Care
  { sku: 'KD-PRC-001', name: 'Sandalwood Soap 4x125g', category: 'Personal Care', unit: 'pack', unitPrice: 210, reorderLevel: 100, description: 'Mysore sandalwood bathing soap combo.', opening: [520, 300, 180], demand: 0.7 },
  { sku: 'KD-PRC-002', name: 'Herbal Shampoo 650ml', category: 'Personal Care', unit: 'bottle', unitPrice: 365, reorderLevel: 60, description: 'Shikakai and hibiscus shampoo.', opening: [240, 90, 70], demand: 0.5 },
  { sku: 'KD-PRC-003', name: 'Coconut Hair Oil 500ml', category: 'Personal Care', unit: 'bottle', unitPrice: 190, reorderLevel: 90, description: 'Cold pressed coconut oil.', opening: [380, 160, 220], demand: 0.6 },
  { sku: 'KD-PRC-004', name: 'Toothpaste 150g', category: 'Personal Care', unit: 'tube', unitPrice: 98, reorderLevel: 150, description: 'Clove and neem toothpaste.', opening: [70, 30, 25], demand: 0.7 },
  // Household Care
  { sku: 'KD-HHC-001', name: 'Detergent Powder 4kg', category: 'Household Care', unit: 'bag', unitPrice: 520, reorderLevel: 70, description: 'Front and top load detergent.', opening: [300, 130, 110], demand: 0.6 },
  { sku: 'KD-HHC-002', name: 'Dishwash Gel 750ml', category: 'Household Care', unit: 'bottle', unitPrice: 155, reorderLevel: 100, description: 'Lemon dishwash liquid gel.', opening: [420, 180, 160], demand: 0.7 },
  { sku: 'KD-HHC-003', name: 'Floor Cleaner 1L', category: 'Household Care', unit: 'bottle', unitPrice: 199, reorderLevel: 80, description: 'Disinfectant floor cleaner, pine.', opening: [330, 140, 120], demand: 0.6 },
  { sku: 'KD-HHC-004', name: 'Agarbatti Incense 100 sticks', category: 'Household Care', unit: 'box', unitPrice: 110, reorderLevel: 100, description: 'Mysore sandal incense sticks.', opening: [600, 380, 150], demand: 0.5 },
  { sku: 'KD-HHC-005', name: 'Mosquito Repellent Refill', category: 'Household Care', unit: 'pack', unitPrice: 85, reorderLevel: 120, description: 'Liquid vaporiser refill 45 nights.', opening: [520, 210, 300], demand: 0.6, isActive: false },
];

export const seedUsers = [
  { name: 'Ananya Iyer', email: 'admin@kaveridistributors.in', role: 'ADMIN' as const, passwordEnv: 'SEED_ADMIN_PASSWORD', defaultPassword: 'Admin@123', isActive: true },
  { name: 'Ravi Kumar', email: 'manager@kaveridistributors.in', role: 'MANAGER' as const, passwordEnv: 'SEED_MANAGER_PASSWORD', defaultPassword: 'Manager@123', isActive: true },
  { name: 'Meera Shetty', email: 'staff@kaveridistributors.in', role: 'STAFF' as const, passwordEnv: 'SEED_STAFF_PASSWORD', defaultPassword: 'Staff@123', isActive: true },
  { name: 'Suresh Gowda', email: 'suresh.gowda@kaveridistributors.in', role: 'STAFF' as const, passwordEnv: 'SEED_STAFF_PASSWORD', defaultPassword: 'Staff@123', isActive: false },
];

export const customers = [
  'Sri Lakshmi Super Market',
  'Namma Mart Jayanagar',
  'Udupi Grand Hotel',
  'Ganesh Provision Stores',
  'Coastal Fresh Retail',
  'Mysore Palace Caterers',
  'Royal Kirana Mangaluru',
  'Hebbal Daily Needs',
];

export const suppliers = ['ITC Ltd.', 'Hindustan Unilever', 'Nandini KMF', 'Britannia Industries', 'Tata Consumer', 'MTR Foods', 'Karnataka Soaps & Detergents'];
