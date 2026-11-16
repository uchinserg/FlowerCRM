// src/components/ChannelBadge.tsx
import React, { useState } from 'react';
import {
  ChannelSource,
  CustomerSegment,
  OrderStatus,
  PaymentStatus,
  PhotoApprovalStatus,
} from '../types/crm';
import { Flower2 } from 'lucide-react';

export const CHANNEL_META: Record<
  ChannelSource,
  { label: string; shortLabel: string; accentText: string }
> = {
  VK: {
    label: 'ВКонтакте',
    shortLabel: 'ВК',
    accentText: 'text-blue-700',
  },
  TELEGRAM: {
    label: 'Telegram',
    shortLabel: 'TG',
    accentText: 'text-sky-700',
  },
  FLOWWOW: {
    label: 'Flowwow',
    shortLabel: 'Flowwow',
    accentText: 'text-rose-700',
  },
  FLAVARY: {
    label: 'Flavary',
    shortLabel: 'Flavary',
    accentText: 'text-purple-700',
  },
  MAX: {
    label: 'MAX Мессенджер',
    shortLabel: 'MAX',
    accentText: 'text-indigo-700',
  },
  WEBSITE: {
    label: 'Веб-сайт',
    shortLabel: 'Сайт',
    accentText: 'text-emerald-700',
  },
  PHONE_POS: {
    label: 'Зал / Телефон',
    shortLabel: 'Зал/Тел',
    accentText: 'text-slate-700',
  },
};

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  VIP: 'VIP клиент',
  REGULAR: 'Постоянный',
  NEW: 'Новый',
  CORPORATE: 'Корпоративный (B2B)',
  SLEEPING: 'Спящий (>180 дн.)',
  BLACKLIST: 'Черный список',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый заказ',
  CONFIRMED_AWAITING_PAYMENT: 'Ждет предоплаты',
  PAID_IN_QUEUE: 'Принят в работу',
  IN_ASSEMBLY: 'На сборке у флориста',
  PHOTO_APPROVAL: 'Фото на согласовании',
  READY_FOR_DELIVERY: 'Готов к выдаче/доставке',
  IN_DELIVERY: 'У курьера',
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменен',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Не оплачен',
  PARTIALLY_PAID: 'Частично оплачен',
  FULLY_PAID: 'Оплачен полностью',
};

export const PHOTO_STATUS_LABELS: Record<PhotoApprovalStatus, string> = {
  NOT_UPLOADED: 'Фото не загружено',
  PENDING_APPROVAL: 'Фото ждет ответа клиента',
  APPROVED: 'Фото согласовано клиентом',
  REVISION_REQUESTED: 'Клиент просит переделать',
};

interface ResilientBouquetImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export const ResilientBouquetImage: React.FC<ResilientBouquetImageProps> = ({
  src,
  alt,
  className = 'w-full h-36 object-cover rounded-lg',
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-500 border border-slate-200 ${className}`}
      >
        <Flower2 className="w-6 h-6 text-rose-500 mb-1" />
        <span className="text-xs text-center px-2 line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};
