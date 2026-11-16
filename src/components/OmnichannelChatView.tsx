// src/components/OmnichannelChatView.tsx
import React, { useState, useMemo } from 'react';
import {
  Branch,
  ChannelSource,
  Conversation,
  Customer,
  Order,
} from '../types/crm';
import {
  CHANNEL_META,
  ORDER_STATUS_LABELS,
  ResilientBouquetImage,
  SEGMENT_LABELS,
} from './ChannelBadge';
import { formatCurrency, formatPhoneDisplay } from '../utils/crmLogic';
import { BOUQUET_IMAGES } from '../data/seedData';
import {
  Camera,
  CheckCheck,
  MapPin,
  MessageSquare,
  Phone,
  PlusCircle,
  Search,
  Send,
  UserCheck,
  X,
  ExternalLink,
} from 'lucide-react';

interface OmnichannelChatViewProps {
  conversations: Conversation[];
  customers: Customer[];
  orders: Order[];
  branches: Branch[];
  selectedBranchId: string;
  activeConversationId: string;
  onSelectConversation: (convId: string) => void;
  onSendMessage: (
    conversationId: string,
    text: string,
    attachmentUrl?: string
  ) => void;
  onOpenCreateOrderFromChat: (conversation: Conversation, customer: Customer) => void;
  onOpenExistingOrder: (order: Order) => void;
  onOpenCustomerProfile: (customer: Customer) => void;
}

const ALL_SOURCES: Array<'ALL' | ChannelSource> = [
  'ALL',
  'VK',
  'TELEGRAM',
  'FLOWWOW',
  'FLAVARY',
  'MAX',
  'WEBSITE',
];

export const OmnichannelChatView: React.FC<OmnichannelChatViewProps> = ({
  conversations,
  customers,
  orders,
  branches,
  selectedBranchId,
  activeConversationId,
  onSelectConversation,
  onSendMessage,
  onOpenCreateOrderFromChat,
  onOpenExistingOrder,
  onOpenCustomerProfile,
}) => {
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ChannelSource>('ALL');
  const [onlyUnread, setOnlyUnread] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [mobileCustomerDrawerOpen, setMobileCustomerDrawerOpen] = useState<boolean>(false);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (selectedBranchId !== 'ALL' && conv.branchId !== selectedBranchId) {
        return false;
      }
      if (sourceFilter !== 'ALL' && conv.source !== sourceFilter) {
        return false;
      }
      if (onlyUnread && conv.unreadCount === 0) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cust = customers.find((c) => c.id === conv.customerId);
        const matchName = cust?.fullName.toLowerCase().includes(q);
        const matchPhone = cust?.phone.includes(q);
        const matchMsg = conv.lastMessagePreview.toLowerCase().includes(q);
        return Boolean(matchName || matchPhone || matchMsg);
      }
      return true;
    });
  }, [conversations, customers, selectedBranchId, sourceFilter, onlyUnread, searchQuery]);

  const activeConversation = useMemo(
    () =>
      filteredConversations.find((c) => c.id === activeConversationId) ||
      conversations.find((c) => c.id === activeConversationId) ||
      filteredConversations[0] ||
      conversations[0],
    [filteredConversations, conversations, activeConversationId]
  );

  const activeCustomer = useMemo(
    () =>
      customers.find((c) => c.id === activeConversation?.customerId) || customers[0],
    [customers, activeConversation]
  );

  const customerOrders = useMemo(
    () => orders.filter((o) => o.customerId === activeCustomer?.id),
    [orders, activeCustomer]
  );

  const linkedOrder = useMemo(
    () =>
      orders.find((o) => o.id === activeConversation?.linkedOrderId) ||
      customerOrders[0],
    [orders, activeConversation, customerOrders]
  );

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftMessage.trim() || !activeConversation) return;
    onSendMessage(activeConversation.id, draftMessage.trim());
    setDraftMessage('');
  };

  const handleSendBouquetPhotoForApproval = () => {
    if (!activeConversation) return;
    onSendMessage(
      activeConversation.id,
      'Ваш букет собран! Направляем живое фото готового букета из салона перед передачей курьеру. Подтвердите, пожалуйста, всё ли вам нравится?',
      BOUQUET_IMAGES.PINK_PEONY
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-4rem)] bg-white border-t border-slate-200 overflow-hidden">
      {/* ЛЕВАЯ КОЛОНКА: Список диалогов и фильтры по 6 источникам */}
      <div className="lg:col-span-4 xl:col-span-3 border-r border-slate-200 flex flex-col h-full overflow-hidden bg-slate-50/40">
        <div className="p-3 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени, телефону, чату..."
              aria-label="Поиск диалогов в чате"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
            />
          </div>

          {/* Интерактивные кнопки фильтрации по 6 каналам */}
          <div className="flex flex-wrap items-center gap-1">
            {ALL_SOURCES.map((src) => {
              const isSelected = sourceFilter === src;
              const label = src === 'ALL' ? 'Все (6)' : CHANNEL_META[src].shortLabel;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Диалогов: {filteredConversations.length}</span>
            <button
              type="button"
              onClick={() => setOnlyUnread((v) => !v)}
              className={`font-medium transition-colors ${
                onlyUnread ? 'text-rose-700 underline' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {onlyUnread ? 'Показать все' : 'Только непрочитанные'}
            </button>
          </div>
        </div>

        {/* Список тредов */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70">
          {filteredConversations.map((conv) => {
            const cust = customers.find((c) => c.id === conv.customerId);
            const isActive = conv.id === activeConversation?.id;
            const channelMeta = CHANNEL_META[conv.source];
            const timeStr = conv.lastMessageAt.slice(11, 16);

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1 ${
                  isActive ? 'bg-slate-900/5' : 'hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {cust?.fullName || 'Клиент'}
                  </span>
                  <span className="text-xs font-mono-tabular text-slate-500 shrink-0">
                    {timeStr}
                  </span>
                </div>

                {/* Метаданные: Канал · Сегмент · LTV (без пилюль, чистая типографика) */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`font-semibold ${channelMeta.accentText}`}>
                    {channelMeta.shortLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{cust ? SEGMENT_LABELS[cust.segment] : 'Новый'}</span>
                  {cust && cust.totalSpentLtv > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        LTV {formatCurrency(cust.totalSpentLtv)}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-slate-600 line-clamp-1 flex-1">
                    {conv.lastMessagePreview}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[11px] font-mono-tabular font-semibold bg-rose-600 text-white rounded">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Окно активной переписки */}
      <div className="lg:col-span-5 xl:col-span-6 flex flex-col h-full overflow-hidden bg-white">
        {activeConversation && activeCustomer ? (
          <>
            {/* Заголовок активного чата */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    {activeCustomer.fullName}
                  </h2>
                  <span className="text-xs text-slate-400">·</span>
                  <span
                    className={`text-xs font-semibold ${
                      CHANNEL_META[activeConversation.source].accentText
                    }`}
                  >
                    {CHANNEL_META[activeConversation.source].label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5 font-mono-tabular">
                  <span>{formatPhoneDisplay(activeCustomer.phone)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    SLA: {activeConversation.firstResponseTimeSec} сек
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Филиал:{' '}
                    {branches.find((b) => b.id === activeConversation.branchId)?.code}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileCustomerDrawerOpen(true)}
                  className="lg:hidden px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Карточка клиента
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenCreateOrderFromChat(activeConversation, activeCustomer)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Создать заказ из диалога
                </button>
              </div>
            </div>

            {/* Лента сообщений */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
              {activeConversation.messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                const isInternal = msg.direction === 'INTERNAL_NOTE';

                if (isInternal) {
                  return (
                    <div
                      key={msg.id}
                      className="mx-auto max-w-xl p-3 rounded-lg bg-amber-50/90 border border-amber-200 text-xs text-amber-950"
                    >
                      <div className="flex items-center justify-between text-[11px] text-amber-700 mb-1">
                        <span className="font-semibold">{msg.senderName}</span>
                        <span className="font-mono-tabular">{msg.sentAt.slice(11, 16)}</span>
                      </div>
                      <p>{msg.textContent}</p>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      isOutbound ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-lg rounded-xl p-3.5 text-sm space-y-2 ${
                        isOutbound
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-900'
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between gap-4 text-[11px] ${
                          isOutbound ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span className="font-medium">{msg.senderName}</span>
                        <span className="font-mono-tabular flex items-center gap-1">
                          {msg.sentAt.slice(11, 16)}
                          {isOutbound && <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />}
                        </span>
                      </div>

                      {msg.attachmentUrl && (
                        <div className="space-y-1.5 pt-1">
                          <ResilientBouquetImage
                            src={msg.attachmentUrl}
                            alt="Фото готового букета на согласование"
                            className="w-full h-48 object-cover rounded-lg border border-slate-700/30"
                          />
                          {msg.relatedOrderNumber && (
                            <p className="text-[11px] font-mono-tabular opacity-80">
                              Фото-контроль по заказу #{msg.relatedOrderNumber}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="leading-relaxed text-xs sm:text-sm">{msg.textContent}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Быстрые шаблоны ответов и форма отправки */}
            <div className="p-3.5 border-t border-slate-200 bg-white space-y-2.5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={handleSendBouquetPhotoForApproval}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Отправить фото букета на согласование
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraftMessage(
                      'Направляю ссылку СБП на предоплату 50%. Как только флорист соберет букет, пришлем живое фото на согласование!'
                    )
                  }
                  className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0"
                >
                  Шаблон: Ссылка на предоплату 50%
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraftMessage(
                      'Курьер выехал к получателю! Ориентировочное время вручения — в течение 35 минут.'
                    )
                  }
                  className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0"
                >
                  Шаблон: Курьер в пути
                </button>
              </div>

              <form onSubmit={handleSendSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  placeholder={`Написать ответ клиенту в ${
                    CHANNEL_META[activeConversation.source].label
                  }...`}
                  aria-label="Текст сообщения клиенту"
                  className="flex-1 px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
                />
                <button
                  type="submit"
                  aria-label="Отправить сообщение"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Отправить
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <MessageSquare className="w-8 h-8 mb-2 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Выберите диалог из списка слева</p>
          </div>
        )}
      </div>

      {/* ПРАВАЯ КОЛОНКА (И МОБИЛЬНЫЙ DRAWER): Мини-карточка клиента, Адреса и Активный заказ */}
      <div
        className={`${
          mobileCustomerDrawerOpen
            ? 'fixed inset-0 z-40 bg-white p-5 overflow-y-auto block'
            : 'hidden lg:flex'
        } lg:col-span-3 xl:col-span-3 flex-col h-full overflow-y-auto p-4 space-y-5 bg-slate-50/40`}
      >
        {mobileCustomerDrawerOpen && (
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 lg:hidden">
            <span className="text-sm font-semibold text-slate-900">Карточка клиента</span>
            <button
              type="button"
              onClick={() => setMobileCustomerDrawerOpen(false)}
              className="p-1.5 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {activeCustomer && (
          <>
            {/* Профиль и ключевые метрики LTV / Средний чек */}
            <div className="space-y-3 pb-4 border-b border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {activeCustomer.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {SEGMENT_LABELS[activeCustomer.segment]} · Скидка{' '}
                    {activeCustomer.personalDiscountPct}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCustomerProfile(activeCustomer)}
                  className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 underline"
                >
                  Профиль
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-700 font-mono-tabular">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatPhoneDisplay(activeCustomer.phone)}</span>
              </div>

              {/* Сетка финансовых метрик клиента */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">Сумма (LTV)</div>
                  <div className="text-xs font-semibold font-mono-tabular text-slate-900 mt-0.5">
                    {formatCurrency(activeCustomer.totalSpentLtv)}
                  </div>
                </div>
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">Средний чек</div>
                  <div className="text-xs font-semibold font-mono-tabular text-slate-900 mt-0.5">
                    {formatCurrency(activeCustomer.averageCheck)}
                  </div>
                </div>
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">Заказов</div>
                  <div className="text-xs font-semibold font-mono-tabular text-slate-900 mt-0.5">
                    {activeCustomer.ordersCount} шт
                  </div>
                </div>
              </div>

              {/* Атрибуция First Touch и Last Touch */}
              <div className="text-xs text-slate-600 space-y-1 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">1-е обращение (неизм.):</span>
                  <span className="font-medium text-slate-800">
                    {CHANNEL_META[activeCustomer.firstContactSource].shortLabel} (
                    {activeCustomer.firstContactAt.slice(0, 10)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Последний заказ:</span>
                  <span className="font-medium text-slate-800">
                    {activeCustomer.lastOrderSource
                      ? `${CHANNEL_META[activeCustomer.lastOrderSource].shortLabel} (${activeCustomer.lastOrderAt?.slice(
                          0,
                          10
                        )})`
                      : 'Нет заказов'}
                  </span>
                </div>
              </div>
            </div>

            {/* Активный заказ по диалогу */}
            <div className="space-y-2.5 pb-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-900">
                  Связанный заказ в работе
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    activeConversation &&
                    onOpenCreateOrderFromChat(activeConversation, activeCustomer)
                  }
                  className="text-xs font-semibold text-rose-700 hover:underline"
                >
                  + Новый заказ
                </button>
              </div>

              {linkedOrder ? (
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {linkedOrder.orderNumber}
                    </span>
                    <span className="text-slate-600 font-medium">
                      {ORDER_STATUS_LABELS[linkedOrder.status]}
                    </span>
                  </div>
                  <p className="text-slate-700 line-clamp-1">
                    {linkedOrder.items.map((i) => i.title).join(', ')}
                  </p>
                  <div className="flex items-center justify-between font-mono-tabular pt-1 border-t border-slate-100">
                    <span>Сумма: {formatCurrency(linkedOrder.totalPrice)}</span>
                    <span
                      className={
                        linkedOrder.debtAmount > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-emerald-700'
                      }
                    >
                      {linkedOrder.debtAmount > 0
                        ? `Долг: ${formatCurrency(linkedOrder.debtAmount)}`
                        : 'Оплачен'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenExistingOrder(linkedOrder)}
                    className="w-full mt-1 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    Открыть карточку заказа
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Нет активного заказа. Нажмите «Создать заказ из диалога».
                </p>
              )}
            </div>

            {/* Цветочные предпочтения и важные даты */}
            <div className="space-y-2 pb-4 border-b border-slate-200 text-xs">
              <h4 className="font-semibold text-slate-900">Цветочные предпочтения</h4>
              <p className="text-slate-600 leading-relaxed">
                {activeCustomer.flowerPreferences || 'Не указаны'}
              </p>
              {activeCustomer.importantDates.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-slate-500 font-medium">Важные даты:</span>
                  {activeCustomer.importantDates.map((d, i) => (
                    <div key={i} className="flex justify-between text-slate-700">
                      <span>{d.title}</span>
                      <span className="font-mono-tabular font-medium">{d.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Сохраненные адреса получателей */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Сохраненные адреса доставки ({activeCustomer.addresses.length})
              </h4>
              <div className="space-y-2">
                {activeCustomer.addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1"
                  >
                    <div className="font-semibold text-slate-800">{addr.label}</div>
                    <div className="text-slate-600">
                      Получатель: {addr.recipientName} ({addr.recipientPhone})
                    </div>
                    <div className="text-slate-700">
                      {addr.city}, {addr.streetAndHouse}
                      {addr.apartmentOffice ? `, ${addr.apartmentOffice}` : ''}
                    </div>
                    {addr.intercomCode && (
                      <div className="text-slate-500 font-mono-tabular">
                        Домофон/Охрана: {addr.intercomCode}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
