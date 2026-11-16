// src/types/crm.ts
export type RoleCode = 'ADMIN' | 'DIRECTOR' | 'MANAGER' | 'FLORIST' | 'COURIER';

export type ChannelSource =
  | 'VK'
  | 'TELEGRAM'
  | 'FLOWWOW'
  | 'FLAVARY'
  | 'MAX'
  | 'WEBSITE'
  | 'PHONE_POS';

export type CustomerSegment =
  | 'NEW'
  | 'REGULAR'
  | 'VIP'
  | 'CORPORATE'
  | 'SLEEPING'
  | 'BLACKLIST';

export type ConversationStatus =
  | 'UNASSIGNED'
  | 'OPEN'
  | 'AWAITING_CLIENT'
  | 'RESOLVED';

export type OrderStatus =
  | 'NEW'
  | 'CONFIRMED_AWAITING_PAYMENT'
  | 'PAID_IN_QUEUE'
  | 'IN_ASSEMBLY'
  | 'PHOTO_APPROVAL'
  | 'READY_FOR_DELIVERY'
  | 'IN_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID';

export type PaymentMethod =
  | 'SBP_QR'
  | 'CARD_ONLINE'
  | 'POS_TERMINAL'
  | 'CASH'
  | 'MARKETPLACE_BALANCE'
  | 'INVOICE_B2B';

export type PhotoApprovalStatus =
  | 'NOT_UPLOADED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REVISION_REQUESTED';

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string;
}

export interface StaffUser {
  id: string;
  fullName: string;
  role: RoleCode;
  branchId: string;
  kpiCommissionPct: number;
  isOnline: boolean;
}

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  category: 'FLOWER' | 'GREENERY' | 'PACKAGING' | 'ADDON';
  unit: string;
  purchaseCostPrice: number; // Закупочная себестоимость 1 стебля/упаковки
  retailUnitPrice: number;   // Розничная цена 1 стебля
  stockByBranch: Record<string, number>;
}

export interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  quantityUsed: number;
  unitCost: number;
  unitRetail: number;
}

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  retailPrice: number;
  estimatedCostPrice: number;
  photoUrl: string;
  assemblyTimeMinutes: number;
  defaultRecipe: RecipeLine[];
}

export interface CustomerAddress {
  id: string;
  label: string;         // Например: "Жена (Офис)", "Мама (Дом)"
  recipientName: string; // Кому везем
  recipientPhone: string;
  city: string;
  streetAndHouse: string;
  apartmentOffice?: string;
  entrance?: string;
  floor?: string;
  intercomCode?: string; // Код домофона / охрана
  courierComment?: string;
  isDefault: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  telegramUsername?: string;
  vkUserId?: string;
  maxUserId?: string;
  preferredBranchId: string;
  assignedManagerId: string;

  // Неизменяемый источник первого касания (First Touch) и динамический Last Touch
  firstContactAt: string;
  firstContactSource: ChannelSource;
  lastOrderAt: string | null;
  lastOrderSource: ChannelSource | null;

  // Финансовые метрики (пересчитываются автоматически)
  ordersCount: number;
  completedOrdersCount: number;
  totalSpentLtv: number;
  averageCheck: number;
  personalDiscountPct: number;

  segment: CustomerSegment;
  isVip: boolean;
  tags: string[];
  flowerPreferences: string;
  importantDates: Array<{ title: string; date: string }>;
  notes: string;
  addresses: CustomerAddress[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL_NOTE';
  senderName: string;
  textContent: string;
  sentAt: string;
  isRead: boolean;
  attachmentUrl?: string;
  attachmentType?: 'IMAGE' | 'BOUQUET_APPROVAL_CARD';
  relatedOrderNumber?: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  branchId: string;
  source: ChannelSource;
  externalThreadId: string;
  assignedUserId: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string;
  firstResponseTimeSec: number;
  linkedOrderId?: string;
  messages: ChatMessage[];
}

export interface OrderItem {
  id: string;
  productId: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  unitCostPrice: number;
  lineTotalPrice: number;
  lineTotalCost: number;
  recipe: RecipeLine[];
}

export interface OrderPaymentRecord {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  isPrepayment: boolean;
  paidAt: string;
  comment: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  externalOrderId?: string;
  branchId: string;
  source: ChannelSource;
  conversationId?: string;
  customerId: string; // ЗАКАЗЧИК (кто платит)

  managerUserId: string;
  floristUserId: string;
  courierUserId?: string;

  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  readyByAt: string;       // Точное время готовности букета
  deliveryDate: string;    // YYYY-MM-DD
  deliveryWindow: string;  // Например: "14:00 - 16:00"

  // ПОЛУЧАТЕЛЬ (кому везем сюрприз)
  isSelfRecipient: boolean;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  intercomCode?: string;
  isSurprise: boolean;
  isAnonymousSender: boolean;
  greetingCardText?: string;
  clientWishesComment?: string;
  internalFloristNote?: string;

  // Контроль качества: Фото готового букета до доставки
  requiresPhotoApproval: boolean;
  photoApprovalStatus: PhotoApprovalStatus;
  beforeDeliveryPhotoUrl?: string;
  photoClientFeedback?: string;

  // Финансовая математика заказа
  items: OrderItem[];
  itemsSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  deliveryPrice: number;
  courierCostPrice: number;
  marketplaceCommission: number;
  totalPrice: number;      // Итоговая стоимость для клиента (final_price)
  totalCostPrice: number;  // Себестоимость цветов и упаковки (total_cost)
  netProfit: number;       // Чистая маржинальная прибыль (profit)

  // Частичная оплата и долг
  paymentStatus: PaymentStatus;
  paidAmount: number;      // Внесено предоплаты / оплаты
  debtAmount: number;      // Остаток к доплате (balance_due)
  payments: OrderPaymentRecord[];

  createdAt: string;
}

export type AuditActionType =
  | 'ORDER_DISCOUNT_CHANGED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_DELETED_ATTEMPT'
  | 'CUSTOMER_MERGED'
  | 'EXCEL_EXPORTED'
  | 'CHANNEL_TOKEN_ROTATED'
  | 'BRANCH_CREATED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: RoleCode;
  branchId: string;
  action: AuditActionType;
  entityType: 'ORDER' | 'CUSTOMER' | 'INTEGRATION' | 'REPORT' | 'BRANCH';
  entityId: string;
  summary: string;
  previousValue?: string;
  newValue?: string;
  ipAddress: string;
}

export interface EncryptedChannelVaultItem {
  id: string;
  source: ChannelSource;
  branchId: string;
  label: string;
  cipherAlgorithm: 'AES-256-GCM';
  keyVersion: number;
  ivHexPreview: string;
  authTagHexPreview: string;
  maskedTokenPreview: string;
  webhookMode: 'WEBHOOK_REST' | 'HYBRID_WORKER_IMAP';
  status: 'ACTIVE' | 'ROTATION_DUE';
  lastRotatedAt: string;
}

export interface RbacRolePermissionProfile {
  role: RoleCode;
  title: string;
  scopeDescription: string;
  canAccessAllBranches: boolean;
  canViewCostAndProfit: boolean;
  canExportExcelDatabase: boolean;
  canManageIntegrationsAndBranches: boolean;
  canAccessChat: boolean;
  canAccessCustomerDirectory: boolean;
  canEditOrderDiscounts: boolean;
  allowedTabs: Array<'CHAT' | 'KANBAN' | 'CUSTOMERS' | 'ANALYTICS' | 'SECURITY_RBAC'>;
}

