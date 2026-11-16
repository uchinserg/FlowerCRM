export type RoleCode = 'ADMIN' | 'DIRECTOR' | 'MANAGER' | 'FLORIST' | 'COURIER';

export type ChannelSource =
  | 'VK'
  | 'TELEGRAM'
  | 'FLOWWOW'
  | 'FLAVARY'
  | 'MAX'
  | 'WEBSITE'
  | 'PHONE_POS';

export type ConnectorMode =
  | 'OFFICIAL_WEBHOOK'
  | 'LONGPOLL_WORKER'
  | 'HYBRID_EMAIL_BRIDGE'
  | 'INTERNAL_WIDGET';

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
  | 'RESOLVED'
  | 'SPAM';

export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL_NOTE';
export type MessageDeliveryStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface UnifiedAttachment {
  type: 'IMAGE' | 'VOICE' | 'DOCUMENT' | 'LOCATION' | 'BOUQUET_APPROVAL_CARD';
  url: string;
  fileName?: string;
}

export interface CustomerAddressRecord {
  id: string;
  customerId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  city: string;
  streetAndHouse: string;
  apartmentOffice?: string;
  intercomCode?: string;
}

export interface CustomerRecord {
  id: string;
  preferredBranchId: string;
  assignedManagerId: string | null;
  fullName: string;
  phone: string | null;
  vkUserId?: string;
  telegramUserId?: string;
  telegramUsername?: string;
  maxUserId?: string;
  flowwowClientHash?: string;
  flavaryClientHash?: string;
  websiteVisitorId?: string;
  firstContactAt: string;
  firstContactSource: ChannelSource;
  lastOrderAt: string | null;
  lastOrderSource: ChannelSource | null;
  ordersCount: number;
  completedOrdersCount: number;
  totalSpentLtv: number;
  averageCheck: number;
  bonusBalance: number;
  personalDiscountPct: number;
  segment: CustomerSegment;
  tags: string[];
  flowerPreferences: string;
  addresses: CustomerAddressRecord[];
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderName: string;
  direction: MessageDirection;
  deliveryStatus: MessageDeliveryStatus;
  textContent: string;
  attachments: UnifiedAttachment[];
  sentAt: string;
}

export interface ConversationRecord {
  id: string;
  branchId: string;
  channelId: string;
  customerId: string;
  assignedUserId: string | null;
  source: ChannelSource;
  externalThreadId: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string;
  lastInboundAt: string | null;
  firstResponseTimeSec: number | null;
  hasActiveOrder: boolean;
  linkedOrderId: string | null;
  isPinned: boolean;
}

export interface OrderDraftFromChat {
  draftOrderNumber: string;
  conversationId: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string | null;
  branchId: string;
  source: ChannelSource;
  managerUserId: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddressSnapshot: string;
  greetingCardText: string;
  clientWishesComment: string;
  referencePhotoUrls: string[];
  requiresPhotoApproval: boolean;
  estimatedTotal: number;
  prepaymentAmount: number;
  debtAmount: number;
}

/**
 * Нормализация телефонов к формату E.164 (+79991234567) и извлечение номера из текста сообщения
 */
export class PhoneNormalizer {
  private static readonly PHONE_REGEX =
    /(?:\+7|8|7)[\s\-()]*(\d{3})[\s\-()]*(\d{3})[\s\-]*(\d{2})[\s\-]*(\d{2})/g;

  public static normalizeToE164(rawPhone?: string | null): string | null {
    if (!rawPhone) return null;
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      return `+7${digits.slice(1)}`;
    }
    if (digits.length === 10 && digits.startsWith('9')) {
      return `+7${digits}`;
    }
    if (digits.length >= 11 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  public static extractFirstPhoneFromText(text?: string | null): string | null {
    if (!text) return null;
    const matches = Array.from(text.matchAll(this.PHONE_REGEX));
    if (matches.length === 0) return null;
    const [, code, p1, p2, p3] = matches[0];
    return `+7${code}${p1}${p2}${p3}`;
  }
}

/**
 * Разрешение профиля клиента и склейка дублей по номеру телефона (Identity Resolution & Deduplication)
 */
export function resolveOrMergeCustomerState(params: {
  customers: CustomerRecord[];
  conversations: ConversationRecord[];
  source: ChannelSource;
  senderExternalId: string;
  senderFullName: string;
  rawPhone?: string | null;
  textContent: string;
  branchId: string;
  sentAtIso: string;
}): {
  updatedCustomers: CustomerRecord[];
  updatedConversations: ConversationRecord[];
  resolvedCustomer: CustomerRecord;
  mergedFromCustomerId: string | null;
  isNewCustomer: boolean;
} {
  const detectedPhone =
    PhoneNormalizer.normalizeToE164(params.rawPhone) ||
    PhoneNormalizer.extractFirstPhoneFromText(params.textContent);

  const matchByExternal = params.customers.find((c) => {
    if (params.source === 'VK') return c.vkUserId === params.senderExternalId;
    if (params.source === 'TELEGRAM') return c.telegramUserId === params.senderExternalId;
    if (params.source === 'MAX') return c.maxUserId === params.senderExternalId;
    if (params.source === 'FLOWWOW') return c.flowwowClientHash === params.senderExternalId;
    if (params.source === 'FLAVARY') return c.flavaryClientHash === params.senderExternalId;
    if (params.source === 'WEBSITE') return c.websiteVisitorId === params.senderExternalId;
    return false;
  });

  const matchByPhone = detectedPhone
    ? params.customers.find((c) => c.phone === detectedPhone)
    : undefined;

  // СЦЕНАРИЙ 1: Найдены две разные карточки (одна по мессенджеру, другая по телефону) -> склеиваем!
  if (matchByExternal && matchByPhone && matchByExternal.id !== matchByPhone.id) {
    const primary = matchByPhone;
    const secondary = matchByExternal;
    const isSecondaryFirstTouchOlder =
      new Date(secondary.firstContactAt).getTime() < new Date(primary.firstContactAt).getTime();

    const mergedCompleted = primary.completedOrdersCount + secondary.completedOrdersCount;
    const mergedLtv = primary.totalSpentLtv + secondary.totalSpentLtv;
    const mergedAvg = mergedCompleted > 0 ? Math.round(mergedLtv / mergedCompleted) : 0;

    const mergedCustomer: CustomerRecord = {
      ...primary,
      phone: detectedPhone,
      vkUserId: primary.vkUserId || secondary.vkUserId,
      telegramUserId: primary.telegramUserId || secondary.telegramUserId,
      telegramUsername: primary.telegramUsername || secondary.telegramUsername,
      maxUserId: primary.maxUserId || secondary.maxUserId,
      flowwowClientHash: primary.flowwowClientHash || secondary.flowwowClientHash,
      flavaryClientHash: primary.flavaryClientHash || secondary.flavaryClientHash,
      websiteVisitorId: primary.websiteVisitorId || secondary.websiteVisitorId,
      firstContactAt: isSecondaryFirstTouchOlder
        ? secondary.firstContactAt
        : primary.firstContactAt,
      firstContactSource: isSecondaryFirstTouchOlder
        ? secondary.firstContactSource
        : primary.firstContactSource,
      ordersCount: primary.ordersCount + secondary.ordersCount,
      completedOrdersCount: mergedCompleted,
      totalSpentLtv: mergedLtv,
      averageCheck: mergedAvg,
      bonusBalance: primary.bonusBalance + secondary.bonusBalance,
      tags: Array.from(new Set([...primary.tags, ...secondary.tags, 'Профиль объединен'])),
      flowerPreferences: [primary.flowerPreferences, secondary.flowerPreferences]
        .filter(Boolean)
        .join(' | '),
      addresses: [...primary.addresses, ...secondary.addresses],
    };

    const updatedCustomers = params.customers
      .filter((c) => c.id !== secondary.id)
      .map((c) => (c.id === primary.id ? mergedCustomer : c));

    const updatedConversations = params.conversations.map((conv) =>
      conv.customerId === secondary.id ? { ...conv, customerId: primary.id } : conv
    );

    return {
      updatedCustomers,
      updatedConversations,
      resolvedCustomer: mergedCustomer,
      mergedFromCustomerId: secondary.id,
      isNewCustomer: false,
    };
  }

  // СЦЕНАРИЙ 2: Найдена существующая карточка
  const existing = matchByPhone || matchByExternal;
  if (existing) {
    const enriched: CustomerRecord = {
      ...existing,
      phone: existing.phone || detectedPhone,
      vkUserId: params.source === 'VK' ? params.senderExternalId : existing.vkUserId,
      telegramUserId:
        params.source === 'TELEGRAM' ? params.senderExternalId : existing.telegramUserId,
      maxUserId: params.source === 'MAX' ? params.senderExternalId : existing.maxUserId,
      flowwowClientHash:
        params.source === 'FLOWWOW' ? params.senderExternalId : existing.flowwowClientHash,
      flavaryClientHash:
        params.source === 'FLAVARY' ? params.senderExternalId : existing.flavaryClientHash,
      websiteVisitorId:
        params.source === 'WEBSITE' ? params.senderExternalId : existing.websiteVisitorId,
    };

    return {
      updatedCustomers: params.customers.map((c) => (c.id === enriched.id ? enriched : c)),
      updatedConversations: params.conversations,
      resolvedCustomer: enriched,
      mergedFromCustomerId: null,
      isNewCustomer: false,
    };
  }

  // СЦЕНАРИЙ 3: Абсолютно новый клиент (First Touch атрибуция)
  const created: CustomerRecord = {
    id: `cust_${Date.now()}`,
    preferredBranchId: params.branchId,
    assignedManagerId: null,
    fullName: params.senderFullName,
    phone: detectedPhone,
    vkUserId: params.source === 'VK' ? params.senderExternalId : undefined,
    telegramUserId: params.source === 'TELEGRAM' ? params.senderExternalId : undefined,
    maxUserId: params.source === 'MAX' ? params.senderExternalId : undefined,
    flowwowClientHash: params.source === 'FLOWWOW' ? params.senderExternalId : undefined,
    flavaryClientHash: params.source === 'FLAVARY' ? params.senderExternalId : undefined,
    websiteVisitorId: params.source === 'WEBSITE' ? params.senderExternalId : undefined,
    firstContactAt: params.sentAtIso,
    firstContactSource: params.source,
    lastOrderAt: null,
    lastOrderSource: null,
    ordersCount: 0,
    completedOrdersCount: 0,
    totalSpentLtv: 0,
    averageCheck: 0,
    bonusBalance: 500, // Приветственные бонусы
    personalDiscountPct: 0,
    segment: 'NEW',
    tags: ['First-Touch: ' + params.source],
    flowerPreferences: '',
    addresses: [],
  };

  return {
    updatedCustomers: [created, ...params.customers],
    updatedConversations: params.conversations,
    resolvedCustomer: created,
    mergedFromCustomerId: null,
    isNewCustomer: true,
  };
}

/**
 * Фильтрация списка диалогов омниканального инбокса
 */
export function filterConversations(
  conversations: ConversationRecord[],
  customers: CustomerRecord[],
  filters: {
    branchId: string;
    source: ChannelSource | 'ALL';
    status: ConversationStatus | 'ALL';
    unreadOnly: boolean;
    search: string;
  }
): ConversationRecord[] {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const q = filters.search.trim().toLowerCase();

  return conversations
    .filter((conv) => {
      if (filters.branchId !== 'ALL' && conv.branchId !== filters.branchId) return false;
      if (filters.source !== 'ALL' && conv.source !== filters.source) return false;
      if (filters.status !== 'ALL' && conv.status !== filters.status) return false;
      if (filters.unreadOnly && conv.unreadCount <= 0) return false;

      if (q.length > 0) {
        const cust = customerMap.get(conv.customerId);
        const inName = cust?.fullName.toLowerCase().includes(q) ?? false;
        const inPhone = cust?.phone?.toLowerCase().includes(q) ?? false;
        const inPreview = conv.lastMessagePreview.toLowerCase().includes(q);
        const inThread = conv.externalThreadId.toLowerCase().includes(q);
        if (!inName && !inPhone && !inPreview && !inThread) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
}

/**
 * Конвертация активного диалога в черновик заказа с разделением Заказчика и Получателя и частичной оплатой
 */
export function buildOrderDraftFromConversation(params: {
  conversation: ConversationRecord;
  customer: CustomerRecord;
  messages: MessageRecord[];
  managerUserId: string;
  estimatedTotal: number;
  prepaymentAmount: number;
  recipientName?: string;
  recipientPhone?: string;
  deliveryAddressSnapshot?: string;
  greetingCardText?: string;
  clientWishesComment?: string;
}): OrderDraftFromChat {
  const defaultAddr = params.customer.addresses[0];
  const referencePhotoUrls: string[] = [];

  for (const m of params.messages) {
    if (m.conversationId === params.conversation.id && m.direction === 'INBOUND') {
      for (const att of m.attachments) {
        if (att.type === 'IMAGE') {
          referencePhotoUrls.push(att.url);
        }
      }
    }
  }

  const total = Math.max(0, params.estimatedTotal);
  const prepaid = Math.min(total, Math.max(0, params.prepaymentAmount));
  const debt = Math.max(0, total - prepaid);

  return {
    draftOrderNumber: `FL-2026-${String(Math.floor(10000 + Math.random() * 89999))}`,
    conversationId: params.conversation.id,
    customerId: params.customer.id,
    customerFullName: params.customer.fullName,
    customerPhone: params.customer.phone,
    branchId: params.conversation.branchId,
    source: params.conversation.source,
    managerUserId: params.managerUserId,
    recipientName: params.recipientName || defaultAddr?.recipientName || 'Получатель сюрприза',
    recipientPhone: params.recipientPhone || defaultAddr?.recipientPhone || '',
    deliveryAddressSnapshot:
      params.deliveryAddressSnapshot ||
      (defaultAddr
        ? `${defaultAddr.city}, ${defaultAddr.streetAndHouse}${defaultAddr.apartmentOffice ? ', кв. ' + defaultAddr.apartmentOffice : ''}`
        : ''),
    greetingCardText: params.greetingCardText || '',
    clientWishesComment:
      params.clientWishesComment || params.customer.flowerPreferences || '',
    referencePhotoUrls,
    requiresPhotoApproval: true,
    estimatedTotal: total,
    prepaymentAmount: prepaid,
    debtAmount: debt,
  };
}
