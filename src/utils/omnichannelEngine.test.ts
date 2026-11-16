import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PhoneNormalizer,
  resolveOrMergeCustomerState,
  filterConversations,
  buildOrderDraftFromConversation,
  CustomerRecord,
  ConversationRecord,
} from './omnichannelEngine';

test('PhoneNormalizer normalizes Russian phone numbers to E.164 and extracts from text', () => {
  assert.equal(PhoneNormalizer.normalizeToE164('8 (916) 555-44-33'), '+79165554433');
  assert.equal(PhoneNormalizer.normalizeToE164('+7-903-111-22-33'), '+79031112233');
  assert.equal(
    PhoneNormalizer.extractFirstPhoneFromText(
      'Здравствуйте! Мой номер для связи 8 (926) 777-88-99, жду фото букета'
    ),
    '+79267778899'
  );
});

test('resolveOrMergeCustomerState merges duplicate profiles when phone matches existing customer', () => {
  const existingCustomerByPhone: CustomerRecord = {
    id: 'cust_1',
    preferredBranchId: 'br_arbat',
    assignedManagerId: 'usr_mgr_1',
    fullName: 'Елена Волкова',
    phone: '+79165554433',
    flowwowClientHash: 'fw_991',
    firstContactAt: '2026-02-10T10:00:00.000Z',
    firstContactSource: 'FLOWWOW',
    lastOrderAt: '2026-03-08T12:00:00.000Z',
    lastOrderSource: 'FLOWWOW',
    ordersCount: 2,
    completedOrdersCount: 2,
    totalSpentLtv: 15000,
    averageCheck: 7500,
    bonusBalance: 750,
    personalDiscountPct: 5,
    segment: 'REGULAR',
    tags: ['Любит пионы'],
    flowerPreferences: 'Пастельные тона',
    addresses: [],
  };

  const temporaryVkCustomer: CustomerRecord = {
    id: 'cust_2',
    preferredBranchId: 'br_arbat',
    assignedManagerId: null,
    fullName: 'Лена В.',
    phone: null,
    vkUserId: 'vk_778899',
    firstContactAt: '2026-11-13T07:00:00.000Z',
    firstContactSource: 'VK',
    lastOrderAt: null,
    lastOrderSource: null,
    ordersCount: 1,
    completedOrdersCount: 1,
    totalSpentLtv: 6000,
    averageCheck: 6000,
    bonusBalance: 300,
    personalDiscountPct: 0,
    segment: 'NEW',
    tags: ['ВК'],
    flowerPreferences: 'Матовая упаковка',
    addresses: [],
  };

  const conversations: ConversationRecord[] = [
    {
      id: 'conv_vk_1',
      branchId: 'br_arbat',
      channelId: 'ch_vk',
      customerId: 'cust_2',
      assignedUserId: null,
      source: 'VK',
      externalThreadId: 'vk_peer_778899',
      status: 'OPEN',
      unreadCount: 1,
      lastMessagePreview: 'Привет',
      lastMessageAt: '2026-11-13T07:00:00.000Z',
      lastInboundAt: '2026-11-13T07:00:00.000Z',
      firstResponseTimeSec: 45,
      hasActiveOrder: false,
      linkedOrderId: null,
      isPinned: false,
    },
  ];

  const result = resolveOrMergeCustomerState({
    customers: [existingCustomerByPhone, temporaryVkCustomer],
    conversations,
    source: 'VK',
    senderExternalId: 'vk_778899',
    senderFullName: 'Лена В.',
    textContent: 'Мой телефон 8 (916) 555-44-33, привяжите к бонусной карте!',
    branchId: 'br_arbat',
    sentAtIso: '2026-11-13T07:30:00.000Z',
  });

  assert.equal(result.mergedFromCustomerId, 'cust_2');
  assert.equal(result.updatedCustomers.length, 1);
  assert.equal(result.resolvedCustomer.id, 'cust_1');
  assert.equal(result.resolvedCustomer.vkUserId, 'vk_778899');
  assert.equal(result.resolvedCustomer.totalSpentLtv, 21000);
  assert.equal(result.resolvedCustomer.completedOrdersCount, 3);
  assert.equal(result.resolvedCustomer.averageCheck, 7000);
  assert.equal(result.resolvedCustomer.firstContactSource, 'FLOWWOW');
  assert.equal(result.updatedConversations[0].customerId, 'cust_1');
});

test('filterConversations filters by source, unreadOnly and search query', () => {
  const customers: CustomerRecord[] = [
    {
      id: 'c1',
      preferredBranchId: 'br_arbat',
      assignedManagerId: null,
      fullName: 'Анна Морозова',
      phone: '+79991112233',
      firstContactAt: '2026-11-01T10:00:00Z',
      firstContactSource: 'TELEGRAM',
      lastOrderAt: null,
      lastOrderSource: null,
      ordersCount: 0,
      completedOrdersCount: 0,
      totalSpentLtv: 0,
      averageCheck: 0,
      bonusBalance: 0,
      personalDiscountPct: 0,
      segment: 'NEW',
      tags: [],
      flowerPreferences: '',
      addresses: [],
    },
  ];

  const conversations: ConversationRecord[] = [
    {
      id: 'conv_1',
      branchId: 'br_arbat',
      channelId: 'ch_tg',
      customerId: 'c1',
      assignedUserId: null,
      source: 'TELEGRAM',
      externalThreadId: 'tg_1',
      status: 'UNASSIGNED',
      unreadCount: 2,
      lastMessagePreview: 'Нужны пионовидные розы',
      lastMessageAt: '2026-11-13T08:00:00Z',
      lastInboundAt: '2026-11-13T08:00:00Z',
      firstResponseTimeSec: null,
      hasActiveOrder: false,
      linkedOrderId: null,
      isPinned: false,
    },
    {
      id: 'conv_2',
      branchId: 'br_arbat',
      channelId: 'ch_vk',
      customerId: 'c1',
      assignedUserId: null,
      source: 'VK',
      externalThreadId: 'vk_1',
      status: 'OPEN',
      unreadCount: 0,
      lastMessagePreview: 'Спасибо за доставку',
      lastMessageAt: '2026-11-13T07:00:00Z',
      lastInboundAt: '2026-11-13T07:00:00Z',
      firstResponseTimeSec: 30,
      hasActiveOrder: false,
      linkedOrderId: null,
      isPinned: false,
    },
  ];

  const filtered = filterConversations(conversations, customers, {
    branchId: 'br_arbat',
    source: 'TELEGRAM',
    status: 'ALL',
    unreadOnly: true,
    search: 'Анна',
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'conv_1');
});

test('buildOrderDraftFromConversation calculates prepayment and remaining debt accurately', () => {
  const customer: CustomerRecord = {
    id: 'c1',
    preferredBranchId: 'br_arbat',
    assignedManagerId: 'mgr_1',
    fullName: 'Дмитрий Соколов',
    phone: '+79035551122',
    firstContactAt: '2026-01-10T10:00:00Z',
    firstContactSource: 'VK',
    lastOrderAt: null,
    lastOrderSource: null,
    ordersCount: 1,
    completedOrdersCount: 1,
    totalSpentLtv: 8500,
    averageCheck: 8500,
    bonusBalance: 400,
    personalDiscountPct: 5,
    segment: 'REGULAR',
    tags: [],
    flowerPreferences: 'Французские розы без гипсофилы',
    addresses: [
      {
        id: 'addr_1',
        customerId: 'c1',
        label: 'Жена (Офис)',
        recipientName: 'Мария Соколова',
        recipientPhone: '+79035559988',
        city: 'Москва',
        streetAndHouse: 'ул. Новый Арбат, 21',
        apartmentOffice: 'оф. 405',
      },
    ],
  };

  const conversation: ConversationRecord = {
    id: 'conv_1',
    branchId: 'br_arbat',
    channelId: 'ch_vk',
    customerId: 'c1',
    assignedUserId: 'mgr_1',
    source: 'VK',
    externalThreadId: 'vk_991',
    status: 'OPEN',
    unreadCount: 0,
    lastMessagePreview: 'Присылаю фото референса',
    lastMessageAt: '2026-11-13T08:00:00Z',
    lastInboundAt: '2026-11-13T08:00:00Z',
    firstResponseTimeSec: 25,
    hasActiveOrder: false,
    linkedOrderId: null,
    isPinned: false,
  };

  const draft = buildOrderDraftFromConversation({
    conversation,
    customer,
    messages: [
      {
        id: 'm1',
        conversationId: 'conv_1',
        senderUserId: null,
        senderName: 'Дмитрий Соколов',
        direction: 'INBOUND',
        deliveryStatus: 'READ',
        textContent: 'Хочу такой букет',
        attachments: [{ type: 'IMAGE', url: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=600' }],
        sentAt: '2026-11-13T07:55:00Z',
      },
    ],
    managerUserId: 'mgr_1',
    estimatedTotal: 9200,
    prepaymentAmount: 4500,
  });

  assert.equal(draft.recipientName, 'Мария Соколова');
  assert.equal(draft.recipientPhone, '+79035559988');
  assert.equal(draft.estimatedTotal, 9200);
  assert.equal(draft.prepaymentAmount, 4500);
  assert.equal(draft.debtAmount, 4700);
  assert.equal(draft.referencePhotoUrls.length, 1);
  assert.equal(draft.requiresPhotoApproval, true);
});
